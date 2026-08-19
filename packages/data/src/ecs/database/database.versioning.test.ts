// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Prototype tests for the pluggable database-version handler injected via
// `Database.create(plugin, { versioning })`. The handler intercepts every
// `db.fromData(snapshot)` and decides whether/how to apply it — covering the
// current "don't load on mismatch" pattern and the future in-place upgrader.

import { describe, it, expect } from "vitest";
import { Database } from "./database.js";
import type { DatabaseVersioningHandler } from "./public/create-database.js";
import type { Schema } from "../../schema/index.js";

const numeric = { type: "number", default: 0 } as const satisfies Schema;

const plugin = Database.Plugin.create({
    components: { a: numeric, b: numeric },
    archetypes: { A: ["a"], AB: ["a", "b"] } as const,
    indexes: { byB: { key: "b" } },
    transactions: {
        addA(t, args: { a: number }) {
            return t.archetypes.A.insert(args);
        },
    },
});

// The app persists its version as an extra field on the snapshot; core.fromData
// ignores unknown top-level fields, so it round-trips harmlessly.
const rejectUnlessV1: DatabaseVersioningHandler = ({ snapshot, load }) => {
    if ((snapshot as { appVersion?: number }).appVersion === 1) load();
};

describe("Database.create versioning handler", () => {
    it("does not load when the handler withholds `load` (version mismatch keeps current state)", () => {
        const source = Database.create(plugin);
        source.transactions.addA({ a: 5 });
        const snap = source.toData() as Record<string, unknown>;
        snap.appVersion = 2; // saved by a newer app

        const target = Database.create(plugin, { versioning: rejectUnlessV1 });
        const kept = target.transactions.addA({ a: 99 });

        target.fromData(snap); // appVersion 2 !== 1 → handler never calls load

        // The database is untouched: its own entity survives, the snapshot's does not.
        expect(target.select(["a"]).length).toBe(1);
        expect(target.read(kept)).toEqual({ a: 99 });
    });

    it("loads normally when the handler calls `load` (version matches)", () => {
        const source = Database.create(plugin);
        const e = source.transactions.addA({ a: 5 });
        const snap = source.toData() as Record<string, unknown>;
        snap.appVersion = 1;

        const target = Database.create(plugin, { versioning: rejectUnlessV1 });
        target.fromData(snap);

        expect(target.read(e)).toEqual({ a: 5 });
    });

    it("upgrades in place: a load-time transform migrating entities (adding a component) does not break the database", () => {
        const source = Database.create(plugin);
        const e = source.transactions.addA({ a: 5 }); // entity in archetype [a]
        const snap = source.toData();

        // Upgrader: on load, migrate every [a] entity to [a,b] on the raw store.
        const upgrade: DatabaseVersioningHandler = ({ load }) => {
            load((store) => {
                const A = (store as any).archetypes.A;
                // Reverse iterate: every row migrates out, so tail-first avoids shifts.
                for (let i = A.rowCount - 1; i >= 0; i--) {
                    (store as any).update(A.columns.id.get(i), { b: 100 });
                }
            });
        };

        const target = Database.create(plugin, { versioning: upgrade });
        target.fromData(snap);

        // Entity migrated to [a,b]; both the archetype query and the index that
        // covers `b` (reseeded after the transform) reflect the added component.
        expect(target.read(e)).toEqual({ a: 5, b: 100 });
        expect(target.select(["b"])).toContain(e);
        expect(target.indexes.byB.find({ b: 100 })).toContain(e);
    });

    it("with no versioning handler, fromData loads as before", () => {
        const source = Database.create(plugin);
        const e = source.transactions.addA({ a: 7 });
        const snap = source.toData();

        const target = Database.create(plugin);
        target.fromData(snap);

        expect(target.read(e)).toEqual({ a: 7 });
    });
});
