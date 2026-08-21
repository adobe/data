// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// PER-QUADRANT versioning. The two PERSISTED quadrants — `document`
// (shared+persistent, e.g. a cloud blob) and `settings` (nonShared+persistent,
// e.g. local storage) — can be saved to different backends and drift to DIFFERENT
// versions. On load they are merged into one store; the upgrader reads EACH
// quadrant's own version stamp and replays only that quadrant's handlers, from its
// own version up to current. Each handler touches exactly one quadrant (the guard
// enforces it), so the two upgrade paths never interfere — the key being that a
// behind-quadrant handler stages ONLY its own quadrant, leaving an ahead quadrant
// (already past that shape) untouched.

import { describe, it, expect } from "vitest";
import type { Schema } from "../../../schema/index.js";
import { Store } from "../../store/index.js";
import { Database } from "../database.js";
import { type VersionEntry, createVersionUpgrader, assertVersionsMatchSchema } from "./index.js";

const num = { type: "number", precision: 1, default: 0 } as const satisfies Schema;
const xy = { type: "object", properties: { x: num, y: num } } as const satisfies Schema;
// `theme` lives in the SETTINGS quadrant (nonShared + persistent).
const themeStr = { type: "string", default: "light", nonShared: true } as const satisfies Schema;
const themeObj = { type: "object", properties: { name: { type: "string", default: "light" } }, nonShared: true } as const satisfies Schema;

// v0 { pos (document), theme (settings) }
//   → v1 MAJOR document: pos number → { x, y }
//   → v2 MAJOR settings: theme string → { name }
// The two majors are in DIFFERENT quadrants, so each quadrant advances on its own.
const versions: readonly VersionEntry[] = [
    { version: 0, changes: { components: { pos: num, theme: themeStr } } },
    // merge patches delete the scalar-only fields the object shape no longer has.
    { version: 1, changes: { components: { pos: { type: "object", properties: { x: num, y: num }, precision: undefined, default: undefined } } }, handler: (s) => Store.remapComponent(s, "pos", xy, (old: number) => ({ x: old, y: old })) },
    { version: 2, changes: { components: { theme: { type: "object", properties: { name: { type: "string", default: "light" } }, default: undefined } } }, handler: (s) => Store.remapComponent(s, "theme", themeObj, (old: string) => ({ name: old })) },
];

const upgrader = () => createVersionUpgrader(versions);

// A merged store: `pos` at `posShape`, `theme` at `themeShape` — exactly what merging
// two independently-saved blobs yields. The version each quadrant was saved at rides
// the blob's save METADATA (passed to the upgrader separately), not the store.
const mergedStore = (posShape: Schema, themeShape: Schema) =>
    Store.create({ components: { pos: posShape, theme: themeShape }, resources: {}, archetypes: {} });

const insertPos = (store: Store<any, any, any>, value: unknown) => (store.ensureArchetype(["pos"] as never[]) as any).insert({ pos: value }) as number;
const insertTheme = (store: Store<any, any, any>, value: unknown) => (store.ensureArchetype(["theme"] as never[]) as any).insert({ theme: value }) as number;

describe("per-quadrant version guard", () => {
    it("accepts a two-quadrant history with single-quadrant handlers", () => {
        expect(() =>
            assertVersionsMatchSchema({
                entries: versions,
                components: { pos: xy, theme: themeObj },
                resources: {},
                currentVersion: 2,
            }),
        ).not.toThrow();
    });
});

describe("independent per-quadrant upgrade (merge-then-upgrade)", () => {
    it("upgrades the BEHIND quadrant only — document at v0, settings already at v2", async () => {
        // settings is at v2 (theme is { name }); document is at v0 (pos is a number).
        const store = mergedStore(num, themeObj);
        const posE = insertPos(store, 5);
        const themeE = insertTheme(store, { name: "dark" });

        const result = await upgrader().handle({ documentStore: store, schemaVersions: { document: 0, settings: 2 } });

        expect(result).not.toBeNull();
        expect((result!.read(posE) as any)?.pos).toEqual({ x: 5, y: 5 }); // document walked v0 → v2
        expect((result!.read(themeE) as any)?.theme).toEqual({ name: "dark" }); // settings untouched (was current)
    });

    it("upgrades the OTHER behind quadrant only — settings at v0, document already at v2", async () => {
        // document is at v2 (pos is { x, y }); settings is at v0 (theme is a string).
        const store = mergedStore(xy, themeStr);
        const posE = insertPos(store, { x: 3, y: 4 });
        const themeE = insertTheme(store, "dark");

        const result = await upgrader().handle({ documentStore: store, schemaVersions: { document: 2, settings: 0 } });

        expect(result).not.toBeNull();
        expect((result!.read(posE) as any)?.pos).toEqual({ x: 3, y: 4 }); // document untouched (was current)
        expect((result!.read(themeE) as any)?.theme).toEqual({ name: "dark" }); // settings walked v0 → v2
    });

    it("is a no-op when BOTH quadrants are already at current (handlers do not re-run)", async () => {
        const store = mergedStore(xy, themeObj);
        const posE = insertPos(store, { x: 1, y: 2 });
        const themeE = insertTheme(store, { name: "dark" });

        const result = await upgrader().handle({ documentStore: store, schemaVersions: { document: 2, settings: 2 } });

        expect(result).not.toBeNull();
        // Had a handler re-run, Store.remapComponent would read the already-migrated
        // shape (an object, not a number/string) and corrupt it — so unchanged proves gating.
        expect((result!.read(posE) as any)?.pos).toEqual({ x: 1, y: 2 });
        expect((result!.read(themeE) as any)?.theme).toEqual({ name: "dark" });
    });

    it("rejects when EITHER quadrant is newer than this app (settings ahead)", async () => {
        const store = mergedStore(xy, themeObj);
        insertPos(store, { x: 1, y: 2 });

        const result = await upgrader().handle({ documentStore: store, schemaVersions: { document: 2, settings: 5 } }); // settings 5 > current 2

        expect(result).toBeNull(); // one quadrant too new → whole load refused
    });
});

describe("misconfiguration is caught eagerly", () => {
    it("throws at construction for a handler with empty changes (a handler must accompany the change it migrates)", () => {
        const empty: readonly VersionEntry[] = [
            { version: 0, changes: { components: { pos: num } } },
            { version: 1, changes: {}, handler: () => {} }, // handler but no schema change
        ];
        expect(() => createVersionUpgrader(empty)).toThrow(/changes no schema/);
    });
});

describe("per-quadrant upgrade through the full Database load path", () => {
    it("stamps both quadrants and commits the merged, upgraded document", async () => {
        // A saved document whose two quadrants drifted apart: document at v0, settings
        // at v2 — the versions ride the blob's save metadata (a real split save would
        // put each quadrant's stamp in its own blob).
        const saved = mergedStore(num, themeObj);
        const posE = insertPos(saved, 7);
        const themeE = insertTheme(saved, { name: "dark" });
        const blob = { ...(saved.toData() as object), schemaVersions: { document: 0, settings: 2 } };

        const app = Database.create(
            Database.Plugin.create({ components: { pos: xy, theme: themeObj }, resources: {}, archetypes: {} }),
            { versioning: upgrader() },
        );
        const result = await app.fromData(blob);

        expect(result).toEqual({ loaded: true });
        expect((app.read(posE) as any)?.pos).toEqual({ x: 7, y: 7 }); // document upgraded v0 → v2
        expect((app.read(themeE) as any)?.theme).toEqual({ name: "dark" }); // settings was current
        expect(app.version).toBe(2); // db exposes the current schema version
    });
});
