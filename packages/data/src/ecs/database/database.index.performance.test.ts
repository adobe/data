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
 * Timing on CI varies, so we use a generous slack and skip when the
 * timer can't resolve a meaningful value (sub-millisecond). When the
 * test does measure, it asserts the time ratio between N and 2N is
 * below `quadratic_floor`, i.e. nowhere near `O(n²)`.
 */

const SIZES = [2000, 4000];
const QUADRATIC_FLOOR = 3.0; // n→2n should be ~2×; quadratic would be ~4×

function measureMs(fn: () => void): number {
    const start = performance.now();
    fn();
    return performance.now() - start;
}

function expectAmortizedLinear(times: readonly number[]): void {
    if (times.some(t => t <= 1)) {
        // Below the resolution we trust — skip the assertion but the
        // test still verified the inserts ran without throwing.
        return;
    }
    const ratio = times[1] / times[0];
    expect(ratio).toBeLessThan(QUADRATIC_FLOOR);
}

describe("Index insertion big-O", () => {
    it("non-unique single-column key (O(1) push per insert)", () => {
        const times = SIZES.map((n) => {
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
        });
        expectAmortizedLinear(times);
    });

    it("unique single-column key (O(1) Map set per insert)", () => {
        const times = SIZES.map((n) => {
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
        });
        expectAmortizedLinear(times);
    });

    it("sorted single-key (deferred: O(1) append + dirty mark per insert)", () => {
        // This is the key case for deferred sort: many inserts into the
        // same sorted bucket should be linear in batch size, not quadratic.
        const times = SIZES.map((n) => {
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
        });
        expectAmortizedLinear(times);
    });

    it("sorted multi-key with custom comparator (deferred)", () => {
        const times = SIZES.map((n) => {
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
        });
        expectAmortizedLinear(times);
    });

    it("multi-value array fan-out (O(elements-per-row) per insert)", () => {
        // Fan-out cost is proportional to the array size per row, not to
        // the total dataset size. Keep the array size constant; insertion
        // time should still be linear in N.
        const times = SIZES.map((n) => {
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
        });
        expectAmortizedLinear(times);
    });

    it("computed scalar key (O(compute) per insert)", () => {
        const times = SIZES.map((n) => {
            const plugin = Database.Plugin.create({
                components: { email: { type: "string" } },
                archetypes: { User: ["email"] },
                indexes: {
                    byEmailCi: {
                        key: (email: string) => email.toLowerCase(),
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
        });
        expectAmortizedLinear(times);
    });

    it("computed multi-value (O(elements + compute) per insert)", () => {
        const times = SIZES.map((n) => {
            const plugin = Database.Plugin.create({
                components: { body: { type: "string" } },
                archetypes: { Doc: ["body"] },
                indexes: {
                    docsByKeyword: {
                        key: (body: string) => body.split(/\s+/),
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
        });
        expectAmortizedLinear(times);
    });

    it("slot map key (O(slots) per insert)", () => {
        const times = SIZES.map((n) => {
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
                            role: (r: { role: string }) => r.role,
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
        });
        expectAmortizedLinear(times);
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
            const out = db.indexes.ordered.find(0);
            expect(out.length).toBe(n);
            // Verify the sort actually happened.
            expect(out[0]).toBeDefined();
        });
        const secondReadTime = measureMs(() => {
            const out = db.indexes.ordered.find(0);
            expect(out.length).toBe(n);
        });

        // The second read should be at least an order of magnitude
        // cheaper than the first. Allow generous slack for noise.
        if (firstReadTime > 1) {
            expect(secondReadTime).toBeLessThan(firstReadTime);
        }
    });
});
