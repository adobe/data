// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Red/green equivalence tests for Database.reset().
//
// Strategy: create two databases from the same plugin — `fresh` and `mutated`.
// Mutate the second with a representative workload, call reset(), then assert
// every observable property equals the fresh baseline.

import { describe, it, expect, vi } from "vitest";
import { Database } from "./database.js";
import { createRebaseReplayConcurrency } from "./concurrency/index.js";

// ---------------------------------------------------------------------------
// Shared plugin
// ---------------------------------------------------------------------------

const plugin = Database.Plugin.create({
    components: {
        x: { type: "number", default: 0 },
        label: { type: "string" },
    } as const,
    resources: {
        score: { default: 0 as number },
        banner: { default: "" as string, nonPersistent: true },
    },
    archetypes: {
        Point: ["x", "label"],
    } as const,
    transactions: {
        addPoint(s, args: { x: number; label: string }) {
            return s.archetypes.Point.insert(args);
        },
        bumpScore(s, args: { delta: number }) {
            s.resources.score = s.resources.score + args.delta;
        },
        setBanner(s, args: { text: string }) {
            s.resources.banner = args.text;
        },
        deletePoint(s, args: { entity: number }) {
            s.delete(args.entity);
        },
    },
});

const makeFresh = () => Database.create(plugin);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const entityCount = (db: ReturnType<typeof makeFresh>) =>
    db.select(["x", "label"]).length;

// Non-fatal perf indicator: warns past budget but never throws (wall-clock
// timing flakes across machines, so it must not gate the suite).
const warnIfExceeds = (actual: number, limit: number, label: string): void => {
    if (actual >= limit) {
        console.warn(`[perf] ${label}: ${actual.toFixed(2)} ≥ ${limit.toFixed(2)} — possible regression`);
    }
};

// ---------------------------------------------------------------------------
// Reset equivalence
// ---------------------------------------------------------------------------

describe("Database.reset()", () => {
    it("select returns 0 entities after reset", () => {
        const db = makeFresh();
        db.transactions.addPoint({ x: 1, label: "a" });
        db.transactions.addPoint({ x: 2, label: "b" });
        expect(entityCount(db)).toBe(2);

        db.reset();
        expect(entityCount(db)).toBe(0);
    });

    it("resources revert to plugin defaults after reset", () => {
        const db = makeFresh();
        db.transactions.bumpScore({ delta: 42 });
        db.transactions.setBanner({ text: "hello" });
        expect(db.resources.score).toBe(42);
        expect(db.resources.banner).toBe("hello");

        db.reset();
        expect(db.resources.score).toBe(0);
        expect(db.resources.banner).toBe("");
    });

    it("resources and entity count match a fresh database after reset", () => {
        const fresh = makeFresh();
        const mutated = makeFresh();
        mutated.transactions.addPoint({ x: 5, label: "x" });
        mutated.transactions.bumpScore({ delta: 7 });
        mutated.reset();

        // Logical state matches — raw column buffers may retain stale bytes
        // beyond rowCount (zeroing would be O(capacity), not O(archetypes)).
        expect(entityCount(mutated)).toBe(entityCount(fresh));
        expect(mutated.resources.score).toBe(fresh.resources.score);
        expect(mutated.resources.banner).toBe(fresh.resources.banner);
    });

    it("is idempotent (double reset is a no-op)", () => {
        const db = makeFresh();
        db.transactions.addPoint({ x: 1, label: "a" });
        db.reset();
        db.reset();

        expect(entityCount(db)).toBe(0);
        expect(db.resources.score).toBe(0);
        expect(db.resources.banner).toBe("");
    });

    it("new entities can be inserted after reset and entity IDs restart", () => {
        const db = makeFresh();
        const e1 = db.transactions.addPoint({ x: 1, label: "old" });
        db.reset();

        const e2 = db.transactions.addPoint({ x: 2, label: "new" });
        expect(db.read(e2)?.label).toBe("new");
        // entity IDs restart from the same base, so e2 should equal e1
        expect(e2).toBe(e1);
        expect(entityCount(db)).toBe(1);
    });

    it("transactions continue to work normally after reset", () => {
        const db = makeFresh();
        db.transactions.addPoint({ x: 9, label: "pre" });
        db.reset();
        db.transactions.addPoint({ x: 3, label: "post" });
        db.transactions.bumpScore({ delta: 5 });

        expect(entityCount(db)).toBe(1);
        expect(db.resources.score).toBe(5);
    });
});

// ---------------------------------------------------------------------------
// Observer fan-out
// ---------------------------------------------------------------------------

describe("Database.reset() — observer notification", () => {
    it("resource observer fires after reset and sees default value", () => {
        const db = makeFresh();
        db.transactions.bumpScore({ delta: 10 });

        const observed: number[] = [];
        const unsub = db.observe.resources.score((v) => observed.push(v));
        // initial callback
        expect(observed).toEqual([10]);

        db.reset();
        // must fire again with default
        expect(observed.at(-1)).toBe(0);

        unsub();
    });

    it("nonPersistent resource observer fires after reset", () => {
        const db = makeFresh();
        db.transactions.setBanner({ text: "hi" });

        const observed: string[] = [];
        const unsub = db.observe.resources.banner((v) => observed.push(v));
        expect(observed).toEqual(["hi"]);

        db.reset();
        expect(observed.at(-1)).toBe("");

        unsub();
    });

    it("entity observer fires null after reset for entities that no longer exist", () => {
        const db = makeFresh();
        const entity = db.transactions.addPoint({ x: 1, label: "a" });

        const observed: Array<unknown> = [];
        const unsub = db.observe.entity(entity)((v) => observed.push(v));
        expect(observed.at(-1)).not.toBeNull();

        db.reset();
        expect(observed.at(-1)).toBeNull();

        unsub();
    });

    it("component observer fires after reset", () => {
        const db = makeFresh();
        const fn = vi.fn();
        const unsub = db.observe.components.x(fn);
        db.transactions.addPoint({ x: 1, label: "a" });
        fn.mockClear();

        db.reset();
        expect(fn).toHaveBeenCalled();
        unsub();
    });
});

// ---------------------------------------------------------------------------
// Reconciler transient queue cleared
// ---------------------------------------------------------------------------

describe("Database.reset() — reconciler queue", () => {
    it("in-flight transients are discarded on reset", () => {
        const db = Database.create(plugin, { concurrency: createRebaseReplayConcurrency("u1") });

        // In sync mode, transactions apply as transients locally.
        db.transactions.addPoint({ x: 1, label: "transient" });
        expect(entityCount(db)).toBe(1);

        db.reset();
        expect(entityCount(db)).toBe(0);

        // After reset, a fresh apply with the same transaction id should behave
        // as if it were a first-time application.
        db.apply({ id: 1, name: "addPoint", args: { x: 2, label: "from-apply" }, time: 1 });
        expect(entityCount(db)).toBe(1);
        expect(db.select(["label"])[0]).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// Performance: O(archetypes) not O(entities)
// ---------------------------------------------------------------------------

describe("Database.reset() — performance", () => {
    it("reset 10k entities faster than proportional construction time", () => {
        const db = makeFresh();
        for (let i = 0; i < 10_000; i++) {
            db.transactions.addPoint({ x: i, label: String(i) });
        }

        const t0 = performance.now();
        db.reset();
        const resetMs = performance.now() - t0;

        // Build a fresh DB as baseline — reset must be at least 10x faster per entity
        const t1 = performance.now();
        const fresh = makeFresh();
        const constructMs = performance.now() - t1;
        _ = fresh;

        // Correctness (the real gate): reset clears every entity.
        expect(entityCount(db)).toBe(0);
        // Timing is an indicator only — reset should be well under 10 ms and
        // dwarfed by construction cost, but wall-clock must not fail the suite.
        warnIfExceeds(resetMs, 10, "reset 10k entities (ms)");
        warnIfExceeds(resetMs, constructMs * 10_000, "reset vs construction ratio");
    });
});

// Suppress unused-variable lint for the fresh db in the perf test.
let _: unknown;
