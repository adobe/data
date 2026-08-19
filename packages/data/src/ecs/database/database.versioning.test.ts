// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Prototype tests for the pluggable database-version policy injected via
// `Database.create(plugin, { versioning })`. The document's version is a numeric
// resource that round-trips with the snapshot; on load the handler reconciles
// the loaded `documentVersion` against the app's `currentVersion` and may accept
// (no-op), migrate the store in place (upgrade), or throw (reject).

import { describe, it, expect } from "vitest";
import { Database } from "./database.js";
import type { DatabaseVersioning } from "./public/create-database.js";
import type { Schema } from "../../schema/index.js";

const numeric = { type: "number", default: 0 } as const satisfies Schema;

// One plugin per app version; they differ only in the version resource's default
// (= the app's current version). Every saved document carries that value.
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

// A handler that upgrades v1 documents (add component `b` to every [a] entity),
// accepts same-version documents, and rejects newer ones.
const versioning: DatabaseVersioning = {
    resource: "databaseVersion",
    handle: ({ documentVersion, currentVersion, store }) => {
        if (documentVersion > currentVersion) {
            return false; // reject: newer document than this app understands
        }
        if (documentVersion < currentVersion) {
            const A = (store as any).archetypes.A;
            for (let i = A.rowCount - 1; i >= 0; i--) {
                (store as any).update(A.columns.id.get(i), { b: 100 });
            }
            (store as any).resources.databaseVersion = currentVersion; // stamp upgraded
        }
        return true;
    },
};

describe("Database.create versioning (numeric version resource)", () => {
    it("accepts a same-version document unchanged", () => {
        const source = Database.create(makePlugin(1));
        const e = source.transactions.addA({ a: 5 });
        const snap = source.toData();

        const target = Database.create(makePlugin(1), { versioning });
        target.fromData(snap);

        expect(target.read(e)).toEqual({ a: 5 });
        expect(target.resources.databaseVersion).toBe(1);
    });

    it("rejects a document newer than the app (returns false)", () => {
        const source = Database.create(makePlugin(2)); // document saved at v2
        source.transactions.addA({ a: 5 });
        const snap = source.toData();

        const target = Database.create(makePlugin(1), { versioning }); // app at v1
        expect(target.fromData(snap)).toBe(false);
    });

    it("upgrades an older document in place (adds a component) and stamps the current version", () => {
        const source = Database.create(makePlugin(1)); // document at v1
        const e = source.transactions.addA({ a: 5 }); // entity in [a]
        const snap = source.toData();

        const target = Database.create(makePlugin(2), { versioning }); // app at v2
        target.fromData(snap);

        // v1 -> v2 migration ran: entity now in [a,b], version stamped current.
        expect(target.read(e)).toEqual({ a: 5, b: 100 });
        expect(target.select(["b"])).toContain(e);
        expect(target.resources.databaseVersion).toBe(2);
    });

    it("with no versioning option, fromData loads as before", () => {
        const source = Database.create(makePlugin(1));
        const e = source.transactions.addA({ a: 7 });
        const snap = source.toData();

        const target = Database.create(makePlugin(1));
        target.fromData(snap);

        expect(target.read(e)).toEqual({ a: 7 });
    });
});
