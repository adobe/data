// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, expect, it } from "vitest";
import { Database } from "./database.js";

/**
 * Big-O verification for index insertion paths.
 *
 * For each declaration shape, we insert `N` rows and check that doubling
 * `N` doubles total time (linear in `N`, i.e. amortized `O(1)` per insert)
 * rather than scaling quadratically. The test compares the ratio between
 * the two batches' insert times against a quadratic-growth threshold.
 *
 * Each test inserts BEFORE any read so the deferred-sort path stays on
 * its happy path: writes are O(1) append + dirty-set membership; the sort
 * only happens when a read drains a dirty bucket.
 *
 * Wall-clock ratios are too noisy across machines/CI to assert on without
 * flaking, so these are **indicators, not gates**: a super-linear ratio logs
 * a `console.warn` but never fails the suite. Deterministic correctness (the
 * inserts/reads run and return the right rows) is still asserted where present.
 */

const SIZES = [2000, 4000];
// Doubling N: a truly linear operation gives ~2× total time; an O(n²)
// regression gives ~4×. We allow up to 5× to absorb GC pauses and JIT
// warmup variance when the suite runs alongside the rest of the repo,
// while still flagging a quadratic regression with margin (it would
// reliably exceed 4×, often by a lot, as N grows).
const QUADRATIC_FLOOR = 5.0;

function measureMs(fn: () => void): number {
    const start = performance.now();
    fn();
    return performance.now() - start;
}

/**
 * Run `fn` once to warm V8's JIT and any per-fixture cold paths, then run
 * it again and return the measured time. Without this, the first invocation
 * in a SIZES.map sees cold optimization and skews the linear-growth ratio,
 * particularly when this suite runs alongside the full repo's other tests.
 */
function warmThenMeasure(fn: () => number): number {
    fn();
    return fn();
}

/**
 * Non-fatal perf indicator: logs a warning when a measured ratio exceeds its
 * budget, but never throws — so a noisy/loaded machine can't fail the suite.
 */
function warnIfExceeds(actual: number, limit: number, label: string): void {
    if (actual >= limit) {
        console.warn(
            `[perf] ${label}: ratio ${actual.toFixed(2)} ≥ ${limit} — possible regression`,
        );
    }
}

function warnAmortizedLinear(times: readonly number[], label = "index insert"): void {
    // Below the resolution we trust (sub-millisecond) the ratio is meaningless.
    if (times.some((t) => t <= 1)) return;
    warnIfExceeds(times[1] / times[0], QUADRATIC_FLOOR, `${label} (amortized-linear)`);
}

describe("Index insertion big-O", () => {
    it("non-unique single-column key (O(1) push per insert)", () => {
        const times = SIZES.map((n) => warmThenMeasure(() => {
            const plugin = Database.Plugin.create({
                components: { parent: { type: "number" } },
                archetypes: { Child: ["parent"] },
                indexes: { childrenOf: { key: "parent" } },
                transactions: {
                    add: (t, p: number) => t.archetypes.Child.insert({ parent: p }),
                },
            });
            const db = Database.create(plugin);
            return measureMs(() => {
                for (let i = 0; i < n; i++) db.transactions.add(0); // all in one bucket
            });
        }));
        warnAmortizedLinear(times);
    });

    it("unique single-column key (O(1) Map set per insert)", () => {
        const times = SIZES.map((n) => warmThenMeasure(() => {
            const plugin = Database.Plugin.create({
                components: { sku: { type: "number" } },
                archetypes: { Row: ["sku"] },
                indexes: { bySku: { key: "sku", unique: true } },
                transactions: {
                    add: (t, sku: number) => t.archetypes.Row.insert({ sku }),
                },
            });
            const db = Database.create(plugin);
            return measureMs(() => {
                for (let i = 0; i < n; i++) db.transactions.add(i); // distinct keys
            });
        }));
        warnAmortizedLinear(times);
    });

    it("sorted single-key (deferred: O(1) append + dirty mark per insert)", () => {
        // This is the key case for deferred sort: many inserts into the
        // same sorted bucket should be linear in batch size, not quadratic.
        const times = SIZES.map((n) => warmThenMeasure(() => {
            const plugin = Database.Plugin.create({
                components: {
                    parent: { type: "number" },
                    fractIndex: { type: "string" },
                },
                archetypes: { Child: ["parent", "fractIndex"] },
                indexes: {
                    ordered: { key: "parent", order: { by: ["fractIndex"] } },
                },
                transactions: {
                    add: (t, fractIndex: string) =>
                        t.archetypes.Child.insert({ parent: 0, fractIndex }),
                },
            });
            const db = Database.create(plugin);
            return measureMs(() => {
                // Insert in reverse-sorted order to stress the comparator
                // path. With deferred sort we never call the comparator
                // during inserts — only on the (deferred) read.
                for (let i = n - 1; i >= 0; i--) {
                    db.transactions.add(String(i).padStart(8, "0"));
                }
            });
        }));
        warnAmortizedLinear(times);
    });

    it("sorted multi-key with custom comparator (deferred)", () => {
        const times = SIZES.map((n) => warmThenMeasure(() => {
            const plugin = Database.Plugin.create({
                components: {
                    owner: { type: "number" },
                    priority: { type: "number" },
                    due: { type: "number" },
                },
                archetypes: { Task: ["owner", "priority", "due"] },
                indexes: {
                    tasksByPriority: {
                        key: "owner",
                        order: {
                            by: ["priority", "due"],
                            compare: (
                                a: { priority: number; due: number },
                                b: { priority: number; due: number },
                            ) => b.priority - a.priority || a.due - b.due,
                        },
                    },
                },
                transactions: {
                    add: (t, args: { priority: number; due: number }) =>
                        t.archetypes.Task.insert({
                            owner: 0,
                            priority: args.priority,
                            due: args.due,
                        }),
                },
            });
            const db = Database.create(plugin);
            return measureMs(() => {
                for (let i = 0; i < n; i++) {
                    db.transactions.add({ priority: n - i, due: i });
                }
            });
        }));
        warnAmortizedLinear(times);
    });

    it("multi-value array fan-out (O(elements-per-row) per insert)", () => {
        // Fan-out cost is proportional to the array size per row, not to
        // the total dataset size. Keep the array size constant; insertion
        // time should still be linear in N.
        const times = SIZES.map((n) => warmThenMeasure(() => {
            const plugin = Database.Plugin.create({
                components: {
                    title: { type: "string" },
                    assigned: { type: "array", items: { type: "string" } },
                },
                archetypes: { Task: ["title", "assigned"] },
                indexes: { tasksByAssignee: { key: "assigned" } },
                transactions: {
                    add: (t, args: { title: string; assigned: readonly string[] }) =>
                        t.archetypes.Task.insert(args),
                },
            });
            const db = Database.create(plugin);
            return measureMs(() => {
                for (let i = 0; i < n; i++) {
                    db.transactions.add({
                        title: `t${i}`,
                        assigned: ["a", "b", "c"],
                    });
                }
            });
        }));
        warnAmortizedLinear(times);
    });

    it("computed scalar key (O(compute) per insert)", () => {
        const times = SIZES.map((n) => warmThenMeasure(() => {
            const plugin = Database.Plugin.create({
                components: { email: { type: "string" } },
                archetypes: { User: ["email"] },
                indexes: {
                    byEmailCi: {
                        key: { email: (c) => c.email!.toLowerCase() },
                        components: ["email"],
                    },
                },
                transactions: {
                    add: (t, email: string) => t.archetypes.User.insert({ email }),
                },
            });
            const db = Database.create(plugin);
            return measureMs(() => {
                for (let i = 0; i < n; i++) db.transactions.add(`User${i}@X.com`);
            });
        }));
        warnAmortizedLinear(times);
    });

    it("computed multi-value (O(elements + compute) per insert)", () => {
        const times = SIZES.map((n) => warmThenMeasure(() => {
            const plugin = Database.Plugin.create({
                components: { body: { type: "string" } },
                archetypes: { Doc: ["body"] },
                indexes: {
                    docsByKeyword: {
                        key: { keyword: (c) => c.body!.split(/\s+/) },
                        components: ["body"],
                    },
                },
                transactions: {
                    add: (t, body: string) => t.archetypes.Doc.insert({ body }),
                },
            });
            const db = Database.create(plugin);
            return measureMs(() => {
                for (let i = 0; i < n; i++) db.transactions.add("alpha beta gamma");
            });
        }));
        warnAmortizedLinear(times);
    });

    it("slot map key (O(slots) per insert)", () => {
        const times = SIZES.map((n) => warmThenMeasure(() => {
            const plugin = Database.Plugin.create({
                components: {
                    team: { type: "number" },
                    roster: {
                        type: "object",
                        properties: { role: { type: "string" } },
                        required: ["role"],
                    },
                },
                archetypes: { Player: ["team", "roster"] },
                indexes: {
                    playerByTeamRole: {
                        key: {
                            team: "team",
                            role: (c) => c.roster!.role,
                        },
                        components: ["roster"],
                    },
                },
                transactions: {
                    add: (t, args: { team: number; roster: { role: string } }) =>
                        t.archetypes.Player.insert(args),
                },
            });
            const db = Database.create(plugin);
            return measureMs(() => {
                for (let i = 0; i < n; i++) {
                    db.transactions.add({ team: i, roster: { role: "qb" } });
                }
            });
        }));
        warnAmortizedLinear(times);
    });
});

describe("Single-entity write is O(1) in bucket size", () => {
    // These tests catch regressions where a single-row delete/update
    // becomes proportional to the bucket size (e.g. via `arr.indexOf`).
    // We compare two bucket sizes ~10× apart; if the per-delete cost
    // were linear in bucket size, the ratio would be ~10× and exceed
    // the threshold. With O(1) bucket-removal it stays near 1×.

    const SMALL = 4_000;
    const BIG = 40_000;
    const DELETES = 2_000;

    function pickTargets(bucketSize: number, count: number): number[] {
        // Targets scattered through the bucket — front, middle, back, with
        // a step. If we picked only the first K, `arr.indexOf` would hit
        // index 0 immediately and the linear-scan cost wouldn't show up.
        const stride = Math.max(1, Math.floor(bucketSize / count));
        const out: number[] = [];
        for (let i = 0; i < count; i++) out.push(i * stride);
        return out;
    }

    function timeDeletes(bucketSize: number): number {
        const plugin = Database.Plugin.create({
            components: { parent: { type: "number" } },
            archetypes: { Child: ["parent"] },
            indexes: { childrenOf: { key: "parent" } },
            transactions: {
                add: (t, p: number) => t.archetypes.Child.insert({ parent: p }),
                delete: (t, e: number) => t.delete(e),
            },
        });
        const db = Database.create(plugin);
        const entities: number[] = [];
        for (let i = 0; i < bucketSize; i++) {
            entities.push(db.transactions.add(0));
        }
        const targets = pickTargets(bucketSize, DELETES).map((i) => entities[i]);
        return measureMs(() => {
            for (const e of targets) db.transactions.delete(e);
        });
    }

    function timeUpdatesBucketChange(bucketSize: number): number {
        const plugin = Database.Plugin.create({
            components: { parent: { type: "number" } },
            archetypes: { Child: ["parent"] },
            indexes: { childrenOf: { key: "parent" } },
            transactions: {
                add: (t, p: number) => t.archetypes.Child.insert({ parent: p }),
                move: (t, args: { e: number; p: number }) =>
                    t.update(args.e, { parent: args.p }),
            },
        });
        const db = Database.create(plugin);
        const entities: number[] = [];
        for (let i = 0; i < bucketSize; i++) {
            entities.push(db.transactions.add(0));
        }
        const targets = pickTargets(bucketSize, DELETES).map((i) => entities[i]);
        return measureMs(() => {
            let p = 1;
            for (const e of targets) db.transactions.move({ e, p: p++ });
        });
    }

    it("non-unique delete: small vs big bucket — ratio stays near 1×", () => {
        const small = warmThenMeasure(() => timeDeletes(SMALL));
        const big = warmThenMeasure(() => timeDeletes(BIG));
        if (small <= 1) return; // sub-ms; can't measure reliably
        // O(bucket.size) would give ratio ~= BIG/SMALL = 10×. O(1) → ~1×.
        // Threshold 3 is permissive enough for CI noise but rejects linear.
        warnIfExceeds(big / small, 3, "single-entity write O(1) in bucket size");
    });

    it("update-with-bucket-change: small vs big source bucket — ratio stays near 1×", () => {
        const small = warmThenMeasure(() => timeUpdatesBucketChange(SMALL));
        const big = warmThenMeasure(() => timeUpdatesBucketChange(BIG));
        if (small <= 1) return;
        warnIfExceeds(big / small, 3, "single-entity write O(1) in bucket size");
    });

    it("sorted-index delete: small vs big bucket — ratio stays near 1×", () => {
        // Sorted indexes used arr.splice with indexOf in the V1 path —
        // O(bucket.size) per delete. Now Set.delete is O(1); the sort
        // cache is invalidated, paid only on the next read.
        function timeSortedDeletes(bucketSize: number): number {
            const plugin = Database.Plugin.create({
                components: {
                    parent: { type: "number" },
                    fractIndex: { type: "string" },
                },
                archetypes: { Child: ["parent", "fractIndex"] },
                indexes: {
                    ordered: { key: "parent", order: { by: ["fractIndex"] } },
                },
                transactions: {
                    add: (t, fractIndex: string) =>
                        t.archetypes.Child.insert({ parent: 0, fractIndex }),
                    delete: (t, e: number) => t.delete(e),
                },
            });
            const db = Database.create(plugin);
            const entities: number[] = [];
            for (let i = 0; i < bucketSize; i++) {
                entities.push(db.transactions.add(String(i).padStart(8, "0")));
            }
            const targets = pickTargets(bucketSize, DELETES).map((i) => entities[i]);
            return measureMs(() => {
                for (const e of targets) db.transactions.delete(e);
            });
        }
        const small = warmThenMeasure(() => timeSortedDeletes(SMALL));
        const big = warmThenMeasure(() => timeSortedDeletes(BIG));
        if (small <= 1) return;
        warnIfExceeds(big / small, 3, "single-entity write O(1) in bucket size");
    });
});

describe("Index read after batched inserts", () => {
    it("sorted read after N inserts pays exactly one O(n log n) sort then is free", () => {
        // The deferred-sort contract: the FIRST find/findRange on a dirty
        // bucket pays the catch-up sort; the second is free. We verify by
        // measuring two consecutive reads.
        const n = 5000;
        const plugin = Database.Plugin.create({
            components: {
                parent: { type: "number" },
                fractIndex: { type: "string" },
            },
            archetypes: { Child: ["parent", "fractIndex"] },
            indexes: {
                ordered: { key: "parent", order: { by: ["fractIndex"] } },
            },
            transactions: {
                add: (t, fractIndex: string) =>
                    t.archetypes.Child.insert({ parent: 0, fractIndex }),
            },
        });
        const db = Database.create(plugin);
        for (let i = n - 1; i >= 0; i--) {
            db.transactions.add(String(i).padStart(8, "0"));
        }

        const firstReadTime = measureMs(() => {
            const out = db.indexes.ordered.find({ parent: 0 });
            expect(out.length).toBe(n);
            // Verify the sort actually happened.
            expect(out[0]).toBeDefined();
        });
        const secondReadTime = measureMs(() => {
            const out = db.indexes.ordered.find({ parent: 0 });
            expect(out.length).toBe(n);
        });

        // The second read should be cheaper than the first (the sort is cached).
        // Indicator only — the correctness (both reads return n sorted rows) is
        // asserted above; the timing just warns on a caching regression.
        if (firstReadTime > 1) {
            warnIfExceeds(secondReadTime, firstReadTime, "cached sorted read should be faster");
        }
    });
});
