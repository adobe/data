// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Verifies the pluggable-concurrency seam by running a client-side
// implementation of the LES coediting model (roll-forward replay) through the
// public `createDatabase` API, and contrasting it with the built-in
// rebase-replay strategy on an identical scenario.

import { describe, it, expect, vi } from "vitest";
import { Database } from "../database.js";
import { Entity } from "../../entity/entity.js";
import { createRollForwardConcurrency } from "./roll-forward-concurrency.js";
import { createRebaseReplayConcurrency } from "./rebase-replay-concurrency.js";
import type { ConcurrencyStrategyFactory } from "./concurrency-strategy.js";

// A single numeric component is enough to expose the roll-forward vs
// re-execute difference: one transaction derives its value from current state.
const plugin = Database.Plugin.create({
    components: {
        counter: { type: "number" },
    } as const,
    resources: {},
    archetypes: {
        Counter: ["counter"],
    } as const,
    transactions: {
        createCounter(t, args: { counter: number }) {
            return t.archetypes.Counter.insert({ counter: args.counter });
        },
        // Reads current value and adds 10 — its result depends on the base
        // state it runs against. This is the transaction whose replay semantics
        // distinguish roll-forward from re-execute.
        bumpFromCurrent(t, args: { entity: Entity }) {
            const current = t.read(args.entity)?.counter ?? 0;
            t.update(args.entity, { counter: current + 10 });
        },
        setAbsolute(t, args: { entity: Entity; value: number }) {
            t.update(args.entity, { counter: args.value });
        },
    },
});

const makeDb = (concurrency: ConcurrencyStrategyFactory) => Database.create(plugin, { concurrency });

// Seed a server-confirmed entity (positive time) so the entity exists in the
// committed base before any optimistic local edit. Returns its id.
const seedCommittedCounter = (db: ReturnType<typeof makeDb>, value: number): Entity => {
    const result = db.apply({ id: 1, userId: "seed", name: "createCounter", args: { counter: value }, time: Date.now() });
    return result!.value as Entity;
};

describe("createRollForwardConcurrency — pluggable concurrency viability", () => {
    it("plugs into createDatabase and exposes itself as the database concurrency strategy", () => {
        const db = makeDb(createRollForwardConcurrency("A"));
        expect(db.concurrency.deferredCommit).toBe(true);
        expect(db.concurrency.userId).toBe("A");
    });

    it("applies a server-confirmed delta directly", () => {
        const db = makeDb(createRollForwardConcurrency("A"));
        const entity = seedCommittedCounter(db, 42);
        expect(db.read(entity)?.counter).toBe(42);
    });

    it("makes a local optimistic transient visible immediately", () => {
        const db = makeDb(createRollForwardConcurrency("A"));
        const entity = seedCommittedCounter(db, 0);

        db.transactions.bumpFromCurrent({ entity });

        // Deferred-commit: applied locally as a transient before any echo.
        expect(db.read(entity)?.counter).toBe(10);
    });

    it("replays pending edits by rolling captured post-images forward, not by re-executing", () => {
        const db = makeDb(createRollForwardConcurrency("A"));
        const entity = seedCommittedCounter(db, 0);

        // Local optimistic edit: 0 -> 10, captured post-image = "set counter 10".
        db.transactions.bumpFromCurrent({ entity });
        expect(db.read(entity)?.counter).toBe(10);

        // A peer's confirmed delta moves the base out from under the pending edit.
        db.apply({ id: 99, userId: "B", name: "setAbsolute", args: { entity, value: 100 }, time: Date.now() + 1 });

        // Roll-forward replays the *captured tuple* (set counter 10), so the
        // pending edit's original post-image wins — NOT 110 (which is what
        // re-executing bumpFromCurrent against the new base of 100 would give).
        expect(db.read(entity)?.counter).toBe(10);
    });

    it("cancel discards a pending transient and restores committed state", () => {
        const db = makeDb(createRollForwardConcurrency("A"));
        const entity = seedCommittedCounter(db, 5);

        // Drive a cancellable transient through the dispatcher via an async
        // generator that yields once then throws (cleanly tears down).
        const observer = vi.fn();
        const unobserve = db.observe.entity(entity)(observer);

        db.transactions.bumpFromCurrent({ entity });
        expect(db.read(entity)?.counter).toBe(15);

        // Cancel the pending entry by its dispatcher-assigned id. The first
        // (and only) wrapped transaction gets id 1 from the dispatcher counter.
        db.cancel(1, "A");
        expect(db.read(entity)?.counter).toBe(5);

        unobserve();
    });

    it("reset clears the pending buffer", () => {
        const db = makeDb(createRollForwardConcurrency("A"));
        const entity = seedCommittedCounter(db, 0);
        db.transactions.bumpFromCurrent({ entity });
        expect(db.read(entity)?.counter).toBe(10);

        db.reset();

        // Store is empty and the pending buffer is gone — re-seeding starts clean.
        const reseeded = seedCommittedCounter(db, 7);
        expect(db.read(reseeded)?.counter).toBe(7);
    });

    it("toData rolls transients back and forward around serialization without disturbing live state", () => {
        const db = makeDb(createRollForwardConcurrency("A"));
        const entity = seedCommittedCounter(db, 0);
        db.transactions.bumpFromCurrent({ entity });
        expect(db.read(entity)?.counter).toBe(10);

        const snapshot = db.toData();
        expect(snapshot).toBeTruthy();

        // The onBeforeToData / onAfterToData hooks fired around serialization,
        // so the live optimistic transient is still present afterward.
        // (As with the built-in rebase-replay reconciler, the snapshot itself
        // references live store buffers and is only valid until the next
        // mutation — callers serialize it immediately.)
        expect(db.read(entity)?.counter).toBe(10);
    });
});

describe("roll-forward vs rebase-replay — same seam, different replay semantics", () => {
    // Identical scenario, swapping only the concurrency strategy factory. The
    // divergent result proves the two engines are genuinely different and that
    // the pluggable seam selects between them with no other changes.
    const runRebaseScenario = (concurrency: ConcurrencyStrategyFactory): number => {
        const db = makeDb(concurrency);
        const entity = seedCommittedCounter(db, 0);
        db.transactions.bumpFromCurrent({ entity });
        db.apply({ id: 99, userId: "B", name: "setAbsolute", args: { entity, value: 100 }, time: Date.now() + 1 });
        return db.read(entity)?.counter ?? NaN;
    };

    it("roll-forward preserves the captured post-image (10)", () => {
        expect(runRebaseScenario(createRollForwardConcurrency("A"))).toBe(10);
    });

    it("rebase-replay re-executes against the new base (110)", () => {
        expect(runRebaseScenario(createRebaseReplayConcurrency("A"))).toBe(110);
    });
});
