// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Red/green tests for Database.pruneToPluginSchema — conforming a database's
// DATA to a target plugin, with the empty foreign structure shed on the next
// load (not by an in-place rebuild).

import { describe, it, expect } from "vitest";
import { Database } from "./database.js";
import type { Schema } from "../../schema/index.js";

const num = { type: "number", default: 0 } as const satisfies Schema;

// The target schema we prune TO.
const targetPlugin = Database.Plugin.create({
    components: { a: num, b: num },
    resources: { keptRes: { default: 0 as number } },
    archetypes: { AB: ["a", "b"] } as const,
    transactions: {
        addAB(t, args: { a: number; b: number }) {
            return t.archetypes.AB.insert(args);
        },
        setKept(t, v: number) {
            t.resources.keptRes = v;
        },
    },
});

// The full schema: target + a foreign component `c`, foreign resource, and
// foreign archetypes.
const fullPlugin = Database.Plugin.create({
    extends: targetPlugin,
    components: { c: num },
    resources: { foreignRes: { default: 0 as number } },
    archetypes: { ABC: ["a", "b", "c"], COnly: ["c"] } as const,
    transactions: {
        addABC(t, args: { a: number; b: number; c: number }) {
            return t.archetypes.ABC.insert(args);
        },
        addCOnly(t, args: { c: number }) {
            return t.archetypes.COnly.insert(args);
        },
        setForeign(t, v: number) {
            t.resources.foreignRes = v;
        },
    },
});

describe("Database.pruneToPluginSchema", () => {
    it("strips foreign data, deletes only-foreign entities, drops foreign resources, and sheds foreign structure on reload", () => {
        const db = Database.create(fullPlugin);
        const eAB = db.transactions.addAB({ a: 1, b: 2 });
        const eABC = db.transactions.addABC({ a: 3, b: 4, c: 5 });
        const eCOnly = db.transactions.addCOnly({ c: 9 });
        db.transactions.setKept(7);
        db.transactions.setForeign(99);

        db.pruneToPluginSchema(targetPlugin);

        // Declared entity untouched; mixed entity keeps declared data, loses `c`;
        // an entity whose every component is foreign is gone.
        expect(db.read(eAB)).toEqual({ a: 1, b: 2 });
        expect(db.read(eABC)).toEqual({ a: 3, b: 4 });
        expect(db.read(eCOnly)).toBeNull();

        // Declared resource preserved; foreign resource retired (value + accessor).
        expect(db.resources.keptRes).toBe(7);
        expect((db.resources as Record<string, unknown>).foreignRes).toBeUndefined();

        // The pruned document, reloaded into a target-only database, carries zero
        // foreign trace, while entity ids and declared data survive the round-trip.
        const pruned = db.toData();
        const target = Database.create(targetPlugin);
        target.fromData(pruned);
        expect(target.read(eAB)).toEqual({ a: 1, b: 2 });
        expect(target.read(eABC)).toEqual({ a: 3, b: 4 });
        expect(target.resources.keptRes).toBe(7);

        const reserialized = target.toData() as {
            componentSchemas: Record<string, unknown>;
            archetypesData: readonly { componentNames: readonly string[] }[];
        };
        expect("c" in reserialized.componentSchemas).toBe(false);
        expect("foreignRes" in reserialized.componentSchemas).toBe(false);
        for (const arch of reserialized.archetypesData) {
            expect(arch.componentNames).not.toContain("c");
            expect(arch.componentNames).not.toContain("foreignRes");
        }
    });

    it("keeps the database usable after prune: declared transactions still run", () => {
        const db = Database.create(fullPlugin);
        db.transactions.addABC({ a: 1, b: 2, c: 3 });

        db.pruneToPluginSchema(targetPlugin);

        // A declared transaction still works and its result is observable.
        const e = db.transactions.addAB({ a: 10, b: 20 });
        expect(db.read(e)).toEqual({ a: 10, b: 20 });
        expect(db.select(["a", "b"]).length).toBe(2); // migrated ABC entity + new AB entity
    });
});
