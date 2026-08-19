// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// SAMPLES — the basic interactions we want to support for database upgrading +
// replication. These read as worked examples, not just assertions:
//
//   1. `captureTransaction` turns an out-of-transaction store edit into a
//      replicable delta (the same change-set a normal transaction produces).
//   2. An upgrade-on-load handler migrates a document in place AND captures the
//      migration as a delta; a peer that only received the delta replays it with
//      `applyOperations` and converges — without running the migration itself.
//
// Core owns only the capture primitive (`captureTransaction`) and the replay
// primitive (`applyOperations`); how the delta travels between peers is entirely
// the (external, pluggable) replication strategy's business.

import { describe, it, expect } from "vitest";
import { Database } from "./database.js";
import { captureTransaction } from "./capture-transaction.js";
import { applyOperations } from "./transactional-store/apply-operations.js";
import { serialize, deserialize } from "../../functions/serialization/serialize.js";
import type { TransactionWriteOperation } from "./transactional-store/transactional-store.js";
import type { DatabaseVersioning } from "./public/create-database.js";
import type { Schema } from "../../schema/index.js";

const numeric = { type: "number", default: 0 } as const satisfies Schema;

// One plugin per app version; they differ only in the version resource's default.
const makePlugin = (currentVersion: number) =>
    Database.Plugin.create({
        components: { a: numeric, b: numeric },
        resources: { databaseVersion: { default: currentVersion } },
        archetypes: { A: ["a"], AB: ["a", "b"] } as const,
        transactions: {
            addA(t, args: { a: number }) {
                return t.archetypes.A.insert(args);
            },
        },
    });

// A v1 -> v2 upgrade: give every [a] entity a `b`, then stamp the version.
const upgradeV1toV2 = (t: any): void => {
    const A = t.archetypes.A;
    for (let i = A.rowCount - 1; i >= 0; i--) {
        t.update(A.columns.id.get(i), { b: 100 });
    }
    t.resources.databaseVersion = 2;
};

describe("SAMPLE: capture an out-of-transaction edit as a replicable delta", () => {
    it("captureTransaction mutates the store in place and returns the change-set", () => {
        const db = Database.create(makePlugin(1));
        const e = db.transactions.addA({ a: 1 });

        // Wrap the raw store, do the edit as one transaction, keep the change.
        const delta = captureTransaction((db as any).store, (t) => {
            t.update(e, { b: 42 });
        });

        // The store was mutated...
        expect(db.read(e)).toEqual({ a: 1, b: 42 });
        // ...and the edit is captured as replayable redo ops + changed sets.
        expect(delta.redo.length).toBeGreaterThan(0);
        expect(delta.changedEntities.has(e)).toBe(true);
        expect(delta.changedComponents.has("b")).toBe(true);
    });
});

describe("SAMPLE: upgrade-on-load produces a delta a peer replays to converge", () => {
    it("client A upgrades + captures; client B replays the delta and matches", () => {
        // A document authored by a v1 app, persisted to bytes. Each client
        // deserializes its OWN copy (as a real client loads from storage/network),
        // so an in-place migration on one never touches another's snapshot.
        const author = Database.create(makePlugin(1));
        const e = author.transactions.addA({ a: 5 });
        const v1bytes = serialize(author.toData());

        // Client A (v2 app) opens the v1 document. Its version handler upgrades in
        // place AND captures the migration as a delta to hand to replication.
        let migrationDelta: TransactionWriteOperation<any>[] = [];
        const versioning: DatabaseVersioning = {
            resource: "databaseVersion",
            handle: ({ documentVersion, currentVersion, store }) => {
                if (documentVersion < currentVersion) {
                    migrationDelta = captureTransaction(store, upgradeV1toV2).redo;
                }
            },
        };
        const clientA = Database.create(makePlugin(2), { versioning });
        clientA.fromData(deserialize(v1bytes));

        expect(clientA.read(e)).toEqual({ a: 5, b: 100 });
        expect(clientA.resources.databaseVersion).toBe(2);
        expect(migrationDelta.length).toBeGreaterThan(0);

        // Client B (v2 app) received the SAME document but only the migration
        // delta from A (not the migration code). It loads the doc unmigrated,
        // then replays the delta and converges to A's state.
        const clientB = Database.create(makePlugin(2));
        clientB.fromData(deserialize(v1bytes));
        expect(clientB.read(e)).toEqual({ a: 5 }); // not yet upgraded
        expect(clientB.resources.databaseVersion).toBe(1);

        applyOperations((clientB as any).store, migrationDelta);

        expect(clientB.read(e)).toEqual({ a: 5, b: 100 }); // converged with A
        expect(clientB.resources.databaseVersion).toBe(2);
    });
});
