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
    { version: 0, changes: { components: { hp: f32, score: f32 }, resources: { turn: { default: 0 } } } },

    // version 1 — ADDITIVE component. No handler, no conversion: old entities just lack it.
    { version: 1, changes: { components: { mana: f32 } } },

    // version 2 — MINOR: `score` gains a cap. Auto-clamped on load; no handler.
    { version: 2, changes: { components: { score: { type: "number", precision: 1, default: 0, maximum: 100 } } } },

    // version 3 — ADDITIVE resource. Materialized at its default when an old document loads.
    { version: 3, changes: { resources: { difficulty: { default: "normal" } } } },

    // version 4 — MAJOR: `hp` goes number → { current, max }. Not auto-convertible, so a
    // handler is required; `remapStoreComponent` is the tool for it.
    {
        version: 4,
        changes: { components: { hp: health } },
        handler: (store) => remapStoreComponent(store, "hp", health, (old: number) => ({ current: old, max: old })),
    },
];

// The current app plugin. Its schema MUST equal fold(versions) — the guard proves it.
const plugin = Database.Plugin.create({
    components: { hp: health, score: { type: "number", precision: 1, default: 0, maximum: 100 } as Schema, mana: f32 },
    resources: { turn: { default: 0 }, difficulty: { default: "normal" }, databaseVersion: { default: versions.length - 1 } },
    archetypes: { Player: ["hp", "score", "mana"] } as const,
    transactions: {
        spawn(t, args: { hp: { current: number; max: number }; score: number; mana: number }) {
            return t.archetypes.Player.insert(args);
        },
    },
});

const upgrader = () => createVersionUpgrader(versions, { resource: "databaseVersion" });

// A version-0 document authored by an old build (hp is a plain number, no mana/difficulty).
const v0Document = () => {
    const v0 = Database.Plugin.create({
        components: { hp: f32, score: f32 },
        resources: { turn: { default: 0 }, databaseVersion: { default: 0 } },
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
    });

    it("fails when the stamped version disagrees with the history length", () => {
        expect(() =>
            assertVersionsMatchSchema({ entries: versions, components: {}, resources: {}, currentVersion: 99 }),
        ).toThrow(/Set the version resource default to 4/);
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
        await app.fromData(doc);

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
        await app.fromData(future.toData());
        expect(app.select(["hp"])).toEqual([kept]); // untouched
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

    it("throws when a handler has no test case", async () => {
        // versions has a handler at version 4; omit its case → coverage failure.
        await expect(testUpgradeHandlers(versions, {})).rejects.toThrow(
            /Version 4 has an upgrade handler but no test case/,
        );
    });
});
