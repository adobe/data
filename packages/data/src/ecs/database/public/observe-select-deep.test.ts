// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, test, vi } from "vitest";
import { assert } from "riteway/vitest";
import { Database } from "../database.js";
import { observeSelectDeep } from "./observe-select-deep.js";

/** Drain all pending microtasks before continuing. */
const flush = () => new Promise(r => setTimeout(r, 0));

const createTestDb = () =>
    Database.create(Database.Plugin.create({
        components: {
            position: { type: "number" },
            velocity: { type: "number" },
            name: { type: "string" },
        },
        archetypes: {
            Moving: ["position", "velocity"],
            Named: ["name"],
            Full: ["position", "velocity", "name"],
        },
        transactions: {
            createMoving(store, args: { position: number; velocity: number }) {
                return store.archetypes.Moving.insert(args);
            },
            createNamed(store, args: { name: string }) {
                return store.archetypes.Named.insert(args);
            },
            createFull(store, args: { position: number; velocity: number; name: string }) {
                return store.archetypes.Full.insert(args);
            },
            updateEntity(store, args: { entity: number; values: any }) {
                store.update(args.entity, args.values);
            },
            deleteEntity(store, args: { entity: number }) {
                store.delete(args.entity);
            },
        },
    }));

describe("observeSelectDeep", () => {
    test("initial emission", async () => {
        const db = createTestDb();
        const e1 = db.transactions.createMoving({ position: 10, velocity: 5 });
        const e2 = db.transactions.createMoving({ position: 20, velocity: 15 });

        const observer = vi.fn();
        const unobserve = observeSelectDeep(db, ["position", "velocity"])(observer);

        await assert({
            given: "entities matching the query",
            should: "emit entity data with included component values",
            actual: observer.mock.calls[0][0],
            expected: [
                { id: e1, position: 10, velocity: 5 },
                { id: e2, position: 20, velocity: 15 },
            ],
        });

        await assert({
            given: "initial subscription",
            should: "emit exactly once",
            actual: observer.mock.calls.length,
            expected: 1,
        });

        unobserve();
    });

    test("re-emit on included component value change", async () => {
        const db = createTestDb();
        const e1 = db.transactions.createMoving({ position: 10, velocity: 5 });

        const observer = vi.fn();
        const unobserve = observeSelectDeep(db, ["position", "velocity"])(observer);

        // Mutate an included component
        db.transactions.updateEntity({ entity: e1, values: { position: 999 } });
        await flush();

        await assert({
            given: "an included component value change",
            should: "re-emit with updated data",
            actual: observer.mock.calls[1][0],
            expected: [{ id: e1, position: 999, velocity: 5 }],
        });

        await assert({
            given: "one mutation after subscription",
            should: "have emitted exactly twice",
            actual: observer.mock.calls.length,
            expected: 2,
        });

        unobserve();
    });

    test("re-emit on entity addition", async () => {
        const db = createTestDb();
        const e1 = db.transactions.createMoving({ position: 10, velocity: 5 });

        const observer = vi.fn();
        const unobserve = observeSelectDeep(db, ["position", "velocity"])(observer);

        const e2 = db.transactions.createMoving({ position: 20, velocity: 15 });
        await flush();

        await assert({
            given: "a new entity matching the query",
            should: "re-emit including the new entity data",
            actual: observer.mock.calls[1][0],
            expected: [
                { id: e1, position: 10, velocity: 5 },
                { id: e2, position: 20, velocity: 15 },
            ],
        });

        unobserve();
    });

    test("re-emit on entity deletion", async () => {
        const db = createTestDb();
        const e1 = db.transactions.createMoving({ position: 10, velocity: 5 });
        const e2 = db.transactions.createMoving({ position: 20, velocity: 15 });

        const observer = vi.fn();
        const unobserve = observeSelectDeep(db, ["position", "velocity"])(observer);

        db.transactions.deleteEntity({ entity: e1 });
        await flush();

        await assert({
            given: "a deleted entity",
            should: "re-emit without the deleted entity",
            actual: observer.mock.calls[1][0],
            expected: [{ id: e2, position: 20, velocity: 15 }],
        });

        unobserve();
    });

    test("no re-emit on non-included component change", async () => {
        const db = createTestDb();
        db.transactions.createFull({ position: 10, velocity: 5, name: "Alice" });

        const observer = vi.fn();
        const unobserve = observeSelectDeep(db, ["position", "velocity"])(observer);

        // Mutate a NON-included component
        db.transactions.createNamed({ name: "Bob" });
        await flush();

        await assert({
            given: "a change to a non-included component only",
            should: "not re-emit",
            actual: observer.mock.calls.length,
            expected: 1,
        });

        unobserve();
    });

    test("deduplicate when data unchanged", async () => {
        const db = createTestDb();
        const e1 = db.transactions.createMoving({ position: 10, velocity: 5 });

        const observer = vi.fn();
        const unobserve = observeSelectDeep(db, ["position", "velocity"])(observer);

        // Update to the SAME value — deep equality should suppress re-emit
        db.transactions.updateEntity({ entity: e1, values: { position: 10 } });
        await flush();

        await assert({
            given: "an update that produces the same data",
            should: "not re-emit",
            actual: observer.mock.calls.length,
            expected: 1,
        });

        unobserve();
    });

    test("same Observe factory for equivalent parameters", async () => {
        const db = createTestDb();

        const obs1 = observeSelectDeep(db, ["position", "velocity"]);
        const obs2 = observeSelectDeep(db, ["position", "velocity"]);

        await assert({
            given: "two calls with equivalent include arrays",
            should: "return the same Observe factory",
            actual: obs1 === obs2,
            expected: true,
        });
    });

    test("late subscriber receives cached value", async () => {
        const db = createTestDb();
        const e1 = db.transactions.createMoving({ position: 10, velocity: 5 });

        const observer1 = vi.fn();
        const unobserve1 = observeSelectDeep(db, ["position", "velocity"])(observer1);

        // Mutate after first subscription
        db.transactions.updateEntity({ entity: e1, values: { position: 999 } });
        await flush();

        // Late subscriber should get the latest cached value immediately
        const observer2 = vi.fn();
        const unobserve2 = observeSelectDeep(db, ["position", "velocity"])(observer2);

        await assert({
            given: "a late subscriber after mutations",
            should: "receive the current cached value synchronously",
            actual: observer2.mock.calls[0][0],
            expected: [{ id: e1, position: 999, velocity: 5 }],
        });

        await assert({
            given: "a late subscriber",
            should: "emit exactly once (cached value only)",
            actual: observer2.mock.calls.length,
            expected: 1,
        });

        unobserve1();
        unobserve2();
    });
});
