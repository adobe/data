// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Worked example of the version-upgrade system: an ordered history of merge-patch
// entries drives (a) a co-located guard test that fails — with a fix recipe —
// when the schema drifts from the history, and (b) an on-load upgrader that walks
// an old document to the current schema, auto-converting the easy changes and
// running a handler for the one that needs custom logic.

import { describe, it, expect } from "vitest";
import type { Schema } from "../../../schema/index.js";
import { Database } from "../database.js";
import {
    type VersionEntry,
    foldSchemas,
    createVersionUpgrader,
    assertVersionsMatchSchema,
    createStoreAtVersion,
    runUpgradeStep,
} from "./index.js";

const number = (extra: Partial<Schema> = {}) => ({ type: "number", default: 0, ...extra } as const satisfies Schema);

// The version history. entries[i] takes version i → i+1; currentVersion = 3.
//   v1: xp, score          v2: + mana          v3: score gains a cap + HALVE all scores (custom)
const entries: readonly VersionEntry[] = [
    { changes: { components: { xp: number(), score: number() } } },
    { changes: { components: { mana: number({ default: 50 }) } } },
    {
        changes: { components: { score: number({ maximum: 1000 }) } },
        handler: (store) => {
            for (const arch of store.queryArchetypes(["score"] as never[])) {
                const cols = arch.columns as Record<string, { get(i: number): number }>;
                for (let i = arch.rowCount - 1; i >= 0; i--) {
                    store.update(cols["id"]!.get(i), { score: cols["score"]!.get(i) / 2 } as never);
                }
            }
        },
    },
];

// The CURRENT app schema — must equal fold(entries). (In an app this is the plugin's.)
const currentComponents: Record<string, Schema> = { xp: number(), score: number({ maximum: 1000 }), mana: number({ default: 50 }) };

// Only `score`'s schema differs across versions (it gains a cap at v3), so the
// component KEYS stay literal (archetype/transaction types are preserved).
const playerPlugin = (databaseVersion: number, score: Schema) =>
    Database.Plugin.create({
        components: { xp: number(), score, mana: number({ default: 50 }) },
        resources: { databaseVersion: { default: databaseVersion } },
        archetypes: { Player: ["xp", "score", "mana"] } as const,
        transactions: {
            spawn(t, args: { xp: number; score: number; mana: number }) {
                return t.archetypes.Player.insert(args);
            },
        },
    });

describe("foldSchemas", () => {
    it("reconstructs the schema at any version by folding merge-patches", () => {
        expect(foldSchemas(entries, 1).components).toEqual({ xp: number(), score: number() });
        expect(foldSchemas(entries, 2).components).toEqual({ xp: number(), score: number(), mana: number({ default: 50 }) });
        expect(foldSchemas(entries).components).toEqual(currentComponents); // full fold = current
    });

    it("applies null in a patch as a removal, per RFC 7396", () => {
        const withRemoval: VersionEntry[] = [
            { changes: { components: { a: number(), b: number() } } },
            { changes: { components: { b: null as never } } },
        ];
        expect(foldSchemas(withRemoval).components).toEqual({ a: number() });
    });

    it("folds resources independently of components", () => {
        const rs: VersionEntry[] = [{ changes: { resources: { theme: { type: "string", default: "light" } as Schema } } }];
        expect(foldSchemas(rs).resources).toEqual({ theme: { type: "string", default: "light" } });
        expect(foldSchemas(rs).components).toEqual({});
    });
});

describe("assertVersionsMatchSchema — the co-located guard", () => {
    it("passes when the history folds to the current schema", () => {
        expect(() =>
            assertVersionsMatchSchema({
                entries,
                components: currentComponents,
                resources: { databaseVersion: { default: 3 } },
                versionResource: "databaseVersion",
                currentVersion: 3,
            }),
        ).not.toThrow();
    });

    it("throws with an auto-convertible recipe (no handler) when a field is added without an entry", () => {
        let message = "";
        try {
            assertVersionsMatchSchema({
                entries,
                components: { ...currentComponents, luck: number() }, // added `luck`, forgot the entry
                resources: {},
            });
        } catch (e) {
            message = (e as Error).message;
        }
        expect(message).toMatch(/no longer matches/);
        expect(message).toContain('"luck"');
        expect(message).toContain("add"); // classified as an add
        expect(message).toContain("auto-convertible"); // → no handler required
        expect(message).not.toContain("REQUIRE a handler");
    });

    it("throws demanding a handler when a component changes in a breaking way", () => {
        let message = "";
        try {
            assertVersionsMatchSchema({
                entries,
                // xp goes number → object (not auto-convertible)
                components: { ...currentComponents, xp: { type: "object", properties: { a: number() } } as Schema },
                resources: {},
            });
        } catch (e) {
            message = (e as Error).message;
        }
        expect(message).toContain('"xp"');
        expect(message).toMatch(/BREAKING/);
        expect(message).toContain("REQUIRE a handler");
    });

    it("throws when the stamped current version disagrees with the history length", () => {
        expect(() =>
            assertVersionsMatchSchema({ entries, components: currentComponents, resources: {}, currentVersion: 5 }),
        ).toThrow(/Set the version resource default to 3/);
    });
});

describe("createVersionUpgrader — on-load upgrade", () => {
    it("upgrades a v2 document: auto-heals the cap and runs the halve-scores handler", async () => {
        // Author a v2 document (no cap on score, score = 800).
        const author = Database.create(playerPlugin(2, number()));
        const e = author.transactions.spawn({ xp: 10, score: 800, mana: 50 });
        const v2doc = author.toData();

        // Open it in the v3 app configured with the upgrader.
        const app = Database.create(playerPlugin(3, number({ maximum: 1000 })), {
            versioning: createVersionUpgrader(entries, { resource: "databaseVersion" }),
        });
        await app.fromData(v2doc);

        expect(app.read(e)).toEqual({ xp: 10, score: 400, mana: 50 }); // handler halved 800 → 400
        expect(app.resources.databaseVersion).toBe(3); // stamped current
    });

    it("loads a current-version document unchanged (no steps to apply)", async () => {
        const author = Database.create(playerPlugin(3, number({ maximum: 1000 })));
        const e = author.transactions.spawn({ xp: 1, score: 100, mana: 50 });
        const doc = author.toData();

        const app = Database.create(playerPlugin(3, number({ maximum: 1000 })), {
            versioning: createVersionUpgrader(entries, { resource: "databaseVersion" }),
        });
        await app.fromData(doc);

        expect(app.read(e)).toEqual({ xp: 1, score: 100, mana: 50 }); // not halved — no step ran
    });

    it("rejects a document newer than the app (non-destructive)", async () => {
        const future = Database.create(playerPlugin(9, number({ maximum: 1000 })));
        future.transactions.spawn({ xp: 1, score: 1, mana: 1 });
        const futureDoc = future.toData();

        const app = Database.create(playerPlugin(3, number({ maximum: 1000 })), {
            versioning: createVersionUpgrader(entries, { resource: "databaseVersion" }),
        });
        const kept = app.transactions.spawn({ xp: 7, score: 7, mana: 7 });
        await app.fromData(futureDoc); // documentVersion 9 > 3 → reject

        expect(app.select(["xp"])).toEqual([kept]); // live db untouched
    });
});

describe("per-major upgrader test in isolation", () => {
    it("the v3 step halves scores (build at v2, run the one step, assert v3)", async () => {
        const store = createStoreAtVersion(entries, 2); // schema at version 2
        const arch = store.ensureArchetype(["xp", "score", "mana"] as never[]) as any;
        const e = arch.insert({ xp: 5, score: 900, mana: 50 });

        await runUpgradeStep(entries, 2, store);

        expect((store.read(e) as Record<string, number> | null)?.score).toBe(450);
    });
});
