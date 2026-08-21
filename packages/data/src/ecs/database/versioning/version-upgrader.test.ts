// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// WORKED EXAMPLE — what an app author writes to version a database.
//
// `versions` is the whole history: one entry per schema change, each recording
// the components/resources it adds, replaces (`name: schema`) or removes
// (`name: null`), plus a handler ONLY when a change is not automatically
// convertible. Additive and minor changes carry NO code.
// One co-located guard test proves the history matches the current schema, and
// `createVersionUpgrader(versions, …)` upgrades old documents on load.

import { describe, it, expect } from "vitest";
import type { Schema } from "../../../schema/index.js";
import { Database } from "../database.js";
import { remapStoreComponent, storeSchemas } from "../../store/index.js";
import {
    type VersionEntry,
    foldSchemas,
    createVersionUpgrader,
    assertVersionsMatchSchema,
    testUpgradeHandlers,
} from "./index.js";

const f32 = { type: "number", precision: 1, default: 0 } as const satisfies Schema;
const health = { type: "object", properties: { current: f32, max: f32 } } as const satisfies Schema;

// ─── the version history (this is the whole authoring surface) ──────────────
const versions: readonly VersionEntry[] = [
    // version 0 — initial schema.
    { version: 0, changes: { components: { hp: f32, score: f32 }, resources: { turn: { type: "integer", default: 0 } } } },

    // version 1 — ADDITIVE component. No handler, no conversion: old entities just lack it.
    { version: 1, changes: { components: { mana: f32 } } },

    // version 2 — MINOR: `score` gains a cap. A merge patch records ONLY the new
    // field. Auto-clamped on load; no handler.
    { version: 2, changes: { components: { score: { maximum: 100 } } } },

    // version 3 — ADDITIVE resource. Materialized at its default when an old document loads.
    { version: 3, changes: { resources: { difficulty: { type: "string", default: "normal" } } } },

    // version 4 — MAJOR: `hp` goes number → { current, max }. Not auto-convertible, so a
    // handler is required; `remapStoreComponent` is the tool for it. The merge patch
    // adds the object shape and DELETES the number-only fields (`precision`/`default`).
    {
        version: 4,
        changes: { components: { hp: { type: "object", properties: { current: f32, max: f32 }, precision: undefined, default: undefined } } },
        handler: (store) => remapStoreComponent(store, "hp", health, (old: number) => ({ current: old, max: old })),
    },
];

// The current app plugin. Its schema MUST equal fold(versions) — the guard proves it.
const plugin = Database.Plugin.create({
    components: { hp: health, score: { type: "number", precision: 1, default: 0, maximum: 100 } as Schema, mana: f32 },
    resources: { turn: { type: "integer", default: 0 }, difficulty: { type: "string", default: "normal" }, databaseVersion: { default: versions.length - 1 } },
    archetypes: { Player: ["hp", "score", "mana"] } as const,
    transactions: {
        spawn(t, args: { hp: { current: number; max: number }; score: number; mana: number }) {
            return t.archetypes.Player.insert(args);
        },
    },
});

const upgrader = () => createVersionUpgrader(versions, { document: "databaseVersion" });

// A version-0 document authored by an old build (hp is a plain number, no mana/difficulty).
const v0Document = () => {
    const v0 = Database.Plugin.create({
        components: { hp: f32, score: f32 },
        resources: { turn: { type: "integer", default: 0 }, databaseVersion: { default: 0 } },
        archetypes: { Being: ["hp", "score"] } as const,
        transactions: { spawn(t, a: { hp: number; score: number }) { return t.archetypes.Being.insert(a); } },
    });
    const db = Database.create(v0);
    const e = db.transactions.spawn({ hp: 80, score: 50 });
    return { doc: db.toData(), entity: e };
};

// ─── the ONE guard test every versioned app writes ──────────────────────────
describe("the version guard", () => {
    it("passes: the history folds to the current schema", () => {
        const db = Database.create(plugin);
        expect(() =>
            assertVersionsMatchSchema({
                entries: versions,
                ...storeSchemas(db),
                versionResource: "databaseVersion",
                currentVersion: db.resources.databaseVersion,
            }),
        ).not.toThrow();
    });

    it("fails with an auto-convertible recipe (no handler) when a field is added without an entry", () => {
        const db = Database.create(plugin);
        const schemas = storeSchemas(db);
        let message = "";
        try {
            assertVersionsMatchSchema({
                entries: versions,
                components: { ...schemas.components, luck: f32 }, // forgot to record `luck`
                resources: schemas.resources,
                versionResource: "databaseVersion",
            });
        } catch (e) { message = (e as Error).message; }
        expect(message).toContain('"luck"');
        expect(message).toContain("auto-convertible");
        expect(message).not.toContain("REQUIRE a handler");
    });

    it("fails demanding a handler when a component changes in a breaking way", () => {
        const db = Database.create(plugin);
        const schemas = storeSchemas(db);
        let message = "";
        try {
            assertVersionsMatchSchema({
                entries: versions,
                components: { ...schemas.components, score: { type: "object", properties: { v: f32 } } as Schema },
                resources: schemas.resources,
                versionResource: "databaseVersion",
            });
        } catch (e) { message = (e as Error).message; }
        expect(message).toMatch(/BREAKING/);
        expect(message).toContain("remapStoreComponent");
        // The recipe is a MERGE patch: it adds the object shape and prints `undefined`
        // deletes for the number-only fields (precision/default/maximum) it drops.
        expect(message).toContain('"type": "object"');
        expect(message).toContain("undefined");
    });

    it("fails when the stamped version disagrees with the history length", () => {
        expect(() =>
            assertVersionsMatchSchema({ entries: versions, components: {}, resources: {}, currentVersion: 99 }),
        ).toThrow(/Set the version resource default to 4/);
    });

    it("rejects a no-op entry with empty changes", () => {
        const entries: VersionEntry[] = [
            { version: 0, changes: { components: { a: f32 } } },
            { version: 1, changes: {} }, // records nothing — a no-op
        ];
        expect(() =>
            assertVersionsMatchSchema({ entries, components: { a: f32 }, resources: {} }),
        ).toThrow(/empty changes/);
    });

    it("fails when an entry's version does not equal its index", () => {
        const misnumbered: VersionEntry[] = [
            { version: 0, changes: {} },
            { version: 5, changes: {} }, // index 1 must be version 1
        ];
        expect(() =>
            assertVersionsMatchSchema({ entries: misnumbered, components: {}, resources: {} }),
        ).toThrow(/index 1 has version 5, but must be 1/);
    });

    it("rejects an untyped versioned schema (only session values may be untyped)", () => {
        const opaque = { default: 5 } as Schema; // no type → not a real schema
        const entries: VersionEntry[] = [{ version: 0, changes: { resources: { opaque } } }];
        expect(() =>
            assertVersionsMatchSchema({ entries, components: {}, resources: { opaque } }),
        ).toThrow(/must declare a type/);
    });

    it("rejects a default that carries structure its schema does not declare", () => {
        const s = { type: "object", properties: { a: { type: "number" } }, default: { a: 1, b: 2 } } as Schema; // `b` undeclared
        const entries: VersionEntry[] = [{ version: 0, changes: { components: { obj: s } } }];
        expect(() =>
            assertVersionsMatchSchema({ entries, components: { obj: s }, resources: {} }),
        ).toThrow(/not fully described/);
    });

    it("rejects a handler that changes schemas across more than one quadrant (red), accepts single-quadrant (green)", () => {
        const doc = { type: "number", precision: 1, default: 0 } as Schema; // document quadrant
        const setting = { type: "number", precision: 1, default: 0, nonShared: true } as Schema; // settings quadrant
        // RED: the v1 handler touches both `a` (document) and `b` (settings).
        const crossQuadrant: VersionEntry[] = [
            { version: 0, changes: { components: { a: doc, b: setting } } },
            { version: 1, changes: { components: { a: doc, b: setting } }, handler: () => {} },
        ];
        expect(() =>
            assertVersionsMatchSchema({ entries: crossQuadrant, components: { a: doc, b: setting }, resources: {} }),
        ).toThrow(/multiple quadrants/);
        // GREEN: the handler touches only `a` (document).
        const oneQuadrant: VersionEntry[] = [
            { version: 0, changes: { components: { a: doc, b: setting } } },
            { version: 1, changes: { components: { a: doc } }, handler: () => {} },
        ];
        expect(() =>
            assertVersionsMatchSchema({ entries: oneQuadrant, components: { a: doc, b: setting }, resources: {} }),
        ).not.toThrow();
    });
});

describe("foldSchemas", () => {
    it("reconstructs any version's schema", () => {
        expect(Object.keys(foldSchemas(versions, 0).components).sort()).toEqual(["hp", "score"]); // version 0 = initial
        expect(foldSchemas(versions, 1).components).toHaveProperty("mana"); // mana added at version 1
        expect(foldSchemas(versions).resources).toHaveProperty("difficulty");
    });
});

describe("createVersionUpgrader — on-load upgrade", () => {
    it("walks a version-0 document to version 4: additive + minor auto-heal, the version-4 handler remaps hp", async () => {
        const { doc, entity } = v0Document();
        const app = Database.create(plugin, { versioning: upgrader() });
        const result = await app.fromData(doc);

        expect(result).toEqual({ loaded: true });
        expect(app.read(entity)).toEqual({ hp: { current: 80, max: 80 }, score: 50 }); // hp remapped; no mana (old entity)
        expect(app.resources.difficulty).toBe("normal"); // additive resource materialized
        expect(app.resources.databaseVersion).toBe(4); // stamped current
    });

    it("rejects a document newer than the app (non-destructive)", async () => {
        const future = Database.create(
            Database.Plugin.create({
                components: { hp: health },
                resources: { databaseVersion: { default: 9 } },
                archetypes: { A: ["hp"] } as const,
                transactions: { spawn(t, a: { hp: { current: number; max: number } }) { return t.archetypes.A.insert(a); } },
            }),
        );
        future.transactions.spawn({ hp: { current: 1, max: 1 } });
        const app = Database.create(plugin, { versioning: upgrader() });
        const kept = app.transactions.spawn({ hp: { current: 5, max: 5 }, score: 5, mana: 5 });
        const result = await app.fromData(future.toData()); // documentVersion 9 > currentVersion 4

        expect(result).toEqual({ loaded: false, documentVersion: 9, currentVersion: 4 }); // observable reject
        expect(app.select(["hp"])).toEqual([kept]); // untouched
    });
});

// ─── only PERSISTED state is versioned; non-persistent is excluded entirely ──
describe("non-persistent schemas are excluded from versioning", () => {
    const session = { type: "number", precision: 1, default: 0, nonPersistent: true, nonShared: true } as const satisfies Schema; // session
    const sharedTransient = { type: "number", precision: 1, default: 0, nonPersistent: true } as const satisfies Schema; // shared + nonPersistent

    it("storeSchemas omits ALL non-persistent schemas (session AND shared-transient)", () => {
        const db = Database.create(
            Database.Plugin.create({
                components: { keep: f32, ephemeral: session, live: sharedTransient },
                resources: {},
                archetypes: {},
            }),
        );
        const s = storeSchemas(db);
        expect(s.components).toHaveProperty("keep");
        expect(s.components).not.toHaveProperty("ephemeral"); // session → excluded
        expect(s.components).not.toHaveProperty("live"); // shared-transient → also excluded (never persisted)
    });

    it("the guard REJECTS a non-persistent schema recorded in the history (red/green)", () => {
        // RED: a version entry carrying a non-persistent (shared-transient) schema.
        const bad: VersionEntry[] = [{ version: 0, changes: { components: { gpuBuffer: sharedTransient } } }];
        expect(() => assertVersionsMatchSchema({ entries: bad, components: {}, resources: {} })).toThrow(
            /non-persistent/,
        );
        // GREEN: drop the non-persistent schema (keep a real persistent one) and the guard is satisfied.
        const good: VersionEntry[] = [{ version: 0, changes: { components: { keep: f32 } } }];
        expect(() => assertVersionsMatchSchema({ entries: good, components: { keep: f32 }, resources: {} })).not.toThrow();
    });
});

// ─── the SECOND guard test: a unit test for every handler, or it fails ──────
describe("every upgrade handler is tested", () => {
    it("runs a case for each handler (and fails if one is missing)", async () => {
        await testUpgradeHandlers(versions, {
            // version 4 is the only handler; a case is REQUIRED for it.
            4: {
                setup: (store) => {
                    const arch = store.ensureArchetype(["hp"] as never[]) as any;
                    return arch.insert({ hp: 42 }) as number;
                },
                expect: (store, e) => {
                    expect((store.read(e) as Record<string, unknown> | null)?.hp).toEqual({ current: 42, max: 42 });
                },
            },
        });
    });

    it("throws SYNCHRONOUSLY when a handler has no test case (so a non-awaited call still fails)", () => {
        // versions has a handler at version 4; omit its case → coverage failure,
        // raised synchronously by the coverage check before any async work.
        expect(() => testUpgradeHandlers(versions, {})).toThrow(
            /Version 4 has an upgrade handler but no test case/,
        );
    });
});
