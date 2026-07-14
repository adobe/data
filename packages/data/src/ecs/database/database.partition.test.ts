// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Database } from "./database.js";

// A plugin whose `cell` component partitions, with a unique name index. The
// transactions write through the transaction context `t`, exercising routing
// and index maintenance on the committed-transaction path.
const plugin = () => Database.Plugin.create({
    components: {
        cell: { type: "integer", partition: true },
        name: { type: "string" },
    },
    archetypes: { Spatial: ["cell", "name"] },
    indexes: { byName: { key: "name", unique: true } },
    transactions: {
        add: (t, input: { cell: number; name: string }) => t.archetypes.Spatial.insert(input),
        move: (t, input: { entity: number; cell: number }) => { t.update(input.entity, { cell: input.cell }); },
    },
});

describe("Database partition integration (transaction context)", () => {
    it("routes t.archetypes.<PartitionedName> inserts and maintains indexes", () => {
        const db = Database.create(plugin());
        const a = db.transactions.add({ cell: 1, name: "alice" }) as number;
        const b = db.transactions.add({ cell: 2, name: "bob" }) as number;

        expect(db.indexes.byName.get({ name: "alice" })).toBe(a);
        expect(db.indexes.byName.get({ name: "bob" })).toBe(b);
        // Distinct cells → distinct concrete archetypes.
        expect(db.locate(a)!.archetype).not.toBe(db.locate(b)!.archetype);
        expect(db.get(a, "cell")).toBe(1);
    });

    it("migrates on a partition-value change inside a transaction; index follows", () => {
        const db = Database.create(plugin());
        const e = db.transactions.add({ cell: 1, name: "mover" }) as number;
        db.transactions.move({ entity: e, cell: 2 });
        expect(db.get(e, "cell")).toBe(2);
        expect(db.indexes.byName.get({ name: "mover" })).toBe(e);
    });

    it("enforces a unique index across value-children inside a transaction (atomic)", () => {
        const db = Database.create(plugin());
        const first = db.transactions.add({ cell: 1, name: "dup" }) as number;
        expect(() => db.transactions.add({ cell: 2, name: "dup" })).toThrow(/[Uu]nique/);
        // Original intact — the failed transaction rolled back cleanly.
        expect(db.indexes.byName.get({ name: "dup" })).toBe(first);
    });
});
