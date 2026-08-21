// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Coverage for the subtlest parts of replay: multiple majors with an additive
// change staged between them, a mid-history document (partial replay), and a
// removal whose handler preserves the data before the component is dropped.

import { describe, it, expect } from "vitest";
import type { Schema } from "../../../schema/index.js";
import { Store } from "../../store/index.js";
import { Database } from "../database.js";
import { type VersionEntry, createVersionUpgrader, createStoreAtVersion } from "./index.js";

const f32 = { type: "number", precision: 1, default: 0 } as const satisfies Schema;
const aObj = { type: "object", properties: { n: f32 } } as const satisfies Schema;
const aObj2 = { type: "object", properties: { n: f32, total: f32 } } as const satisfies Schema;

// Read/write a resource singleton on a bare document store (no typed accessor).
const getRes = (store: Store<any, any, any>, name: string): number => {
    const arch = store.queryArchetypes([name] as never[])[0]!;
    return (arch.columns as Record<string, { get(i: number): number }>)[name]!.get(0);
};

// v0 {a} → v1 +b (additive) → v2 MAJOR a:number→{n} → v3 +bonus resource (additive)
//   → v4 MAJOR a:{n}→{n,total} where total = n + bonus (reads the resource staged in at v3)
const versions: readonly VersionEntry[] = [
    { version: 0, changes: { components: { a: f32 } } },
    { version: 1, changes: { components: { b: f32 } } },
    { version: 2, changes: { components: { a: { type: "object", properties: { n: f32 }, precision: undefined, default: undefined } } }, handler: (s) => Store.remapComponent(s, "a", aObj, (old: number) => ({ n: old })) },
    { version: 3, changes: { resources: { bonus: { type: "integer", default: 10 } } } },
    {
        version: 4,
        changes: { components: { a: { properties: { total: f32 } } } }, // merge patch: add one property

        handler: (s) => {
            const bonus = getRes(s, "bonus"); // materialized during staging (added at v3)
            Store.remapComponent(s, "a", aObj2, (old: { n: number }) => ({ n: old.n, total: old.n + bonus }));
        },
    },
];

describe("multi-major replay", () => {
    it("runs every major in order, staging the additive resource in before the last handler reads it", async () => {
        const upgrader = createVersionUpgrader(versions);
        const doc = createStoreAtVersion(versions, 0); // schema at version 0: { a }
        const e = (doc.ensureArchetype(["a"] as never[]) as any).insert({ a: 5 });

        // Saved at version 0 in both quadrants (the metadata a real blob would carry).
        const result = await upgrader.handle({ documentStore: doc, schemaVersions: { document: 0, settings: 0 } });

        expect(result).not.toBeNull();
        // v2 turned 5 into { n: 5 }; v4 read the staged bonus (10) and computed total.
        expect((result!.read(e) as any)?.a).toEqual({ n: 5, total: 15 });
    });

    it("starts partway through history for a mid-version document (only later majors run)", async () => {
        const upgrader = createVersionUpgrader(versions);
        const doc = createStoreAtVersion(versions, 3); // already { a:{n}, b } + bonus resource
        const e = (doc.ensureArchetype(["a"] as never[]) as any).insert({ a: { n: 7 } });

        // Saved at v3 → only the v4 handler should run.
        const result = await upgrader.handle({ documentStore: doc, schemaVersions: { document: 3, settings: 3 } });

        // Only the v4 handler ran; a already at {n} from version 3.
        expect((result!.read(e) as any)?.a).toEqual({ n: 7, total: 17 });
    });
});

describe("removal with a preservation handler (full load path)", () => {
    it("reads a component's data into a resource, then drops the component on commit", async () => {
        // A v0 document with a `doomed` component carrying data.
        const v0Plugin = Database.Plugin.create({
            components: { keep: f32, doomed: f32 },
            resources: {},
            archetypes: { E: ["keep", "doomed"] } as const,
            transactions: { add(t, a: { keep: number; doomed: number }) { return t.archetypes.E.insert(a); } },
        });
        const author = Database.create(v0Plugin);
        const e = author.transactions.add({ keep: 1, doomed: 99 });
        const doc = author.toData();

        // v1 removes `doomed` and preserves its value into a new `rescued` resource.
        const versions2: readonly VersionEntry[] = [
            { version: 0, changes: { components: { keep: f32, doomed: f32 } } },
            {
                version: 1,
                changes: { components: { doomed: undefined }, resources: { rescued: { type: "integer", default: 0 } } },
                handler: (s) => {
                    let sum = 0;
                    for (const arch of s.queryArchetypes(["doomed"] as never[])) {
                        const col = arch.columns as Record<string, { get(i: number): number }>;
                        for (let i = 0; i < arch.rowCount; i++) sum += col["doomed"]!.get(i);
                    }
                    // `rescued` was materialized during staging (new at v1); set its singleton.
                    const r = s.queryArchetypes(["rescued"] as never[])[0]!;
                    s.update((r.columns as any).id.get(0), { rescued: sum } as never);
                },
            },
        ];

        const app = Database.create(
            Database.Plugin.create({
                components: { keep: f32 },
                resources: { rescued: { type: "integer", default: 0 } },
                archetypes: { E: ["keep"] } as const,
            }),
            { versioning: createVersionUpgrader(versions2) },
        );
        await app.fromData(doc);

        expect(app.read(e)).toEqual({ keep: 1 }); // doomed dropped on commit
        expect(app.resources.rescued).toBe(99); // preserved before removal
    });
});
