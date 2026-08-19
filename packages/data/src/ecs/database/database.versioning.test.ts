// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Tests for the pluggable load-time version handler injected via
// `Database.create(plugin, { versioning })`. The snapshot is staged into a
// scratch store; the handler inspects the document version (a numeric resource)
// and returns a store to commit (accept, possibly migrated) or `null` (reject,
// leaving the live database untouched).

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

// Handler for an app at `currentVersion`: rejects newer documents (returns null),
// upgrades v(<current) documents by adding `b` to every [a] entity and stamping
// the version, and accepts same-version documents. Returns the (mutated) scratch.
const makeVersioning = (currentVersion: number): DatabaseVersioning => (scratch) => {
    const documentVersion = (scratch.resources as Record<string, number>).databaseVersion;
    if (documentVersion > currentVersion) return null; // reject: too new to read
    if (documentVersion < currentVersion) {
        const A = (scratch as any).archetypes.A;
        for (let i = A.rowCount - 1; i >= 0; i--) {
            (scratch as any).update(A.columns.id.get(i), { b: 100 });
        }
        (scratch as any).resources.databaseVersion = currentVersion; // stamp upgraded
    }
    return scratch;
};

describe("Database.create versioning (scratch-store loader)", () => {
    it("accepts a same-version document", () => {
        const source = Database.create(makePlugin(1));
        const e = source.transactions.addA({ a: 5 });
        const snap = source.toData();

        const target = Database.create(makePlugin(1), { versioning: makeVersioning(1) });
        target.fromData(snap);

        expect(target.read(e)).toEqual({ a: 5 });
        expect(target.resources.databaseVersion).toBe(1);
    });

    it("rejects a newer document non-destructively — the live database is untouched", () => {
        const source = Database.create(makePlugin(2)); // document saved at v2
        source.transactions.addA({ a: 5 });
        const snap = source.toData();

        // Target app at v1 already holds some state before the load.
        const target = Database.create(makePlugin(1), { versioning: makeVersioning(1) });
        const kept = target.transactions.addA({ a: 99 });

        target.fromData(snap); // v2 > v1 → handler returns null

        // Nothing from the rejected document loaded, and the pre-existing state
        // is preserved (reject never touches the live database).
        expect(target.select(["a"])).toEqual([kept]);
        expect(target.read(kept)).toEqual({ a: 99 });
        expect(target.resources.databaseVersion).toBe(1);
    });

    it("upgrades an older document (adds a component) and stamps the current version", () => {
        const source = Database.create(makePlugin(1)); // document at v1
        const e = source.transactions.addA({ a: 5 }); // entity in [a]
        const snap = source.toData();

        const target = Database.create(makePlugin(2), { versioning: makeVersioning(2) }); // app at v2
        target.fromData(snap);

        // v1 -> v2 migration ran: entity now in [a,b], version stamped current.
        expect(target.read(e)).toEqual({ a: 5, b: 100 });
        expect(target.select(["b"])).toContain(e);
        expect(target.resources.databaseVersion).toBe(2);
    });

    it("with no versioning option, fromData loads directly as before", () => {
        const source = Database.create(makePlugin(1));
        const e = source.transactions.addA({ a: 7 });
        const snap = source.toData();

        const target = Database.create(makePlugin(1));
        target.fromData(snap);

        expect(target.read(e)).toEqual({ a: 7 });
    });

    it("commits a different store than the scratch when the handler returns one", () => {
        const source = Database.create(makePlugin(1));
        source.transactions.addA({ a: 1 });
        const snap = source.toData();

        // Handler ignores the staged scratch and commits a store it built itself.
        const versioning: DatabaseVersioning = () => {
            const fresh = Database.create(makePlugin(1));
            fresh.transactions.addA({ a: 999 });
            return (fresh as any).store;
        };
        const target = Database.create(makePlugin(1), { versioning });
        target.fromData(snap);

        // The committed data is the freshly-built store's, not the snapshot's.
        expect(target.select(["a"]).map((x) => target.read(x)?.a)).toEqual([999]);
    });
});

// A settings/document split so a scoped load exercises quadrant isolation.
const scopedPlugin = Database.Plugin.create({
    components: {},
    resources: {
        docRes: { default: 0 as number }, // shared (document) quadrant
        settingRes: { default: 1 as number, nonShared: true }, // non-shared (settings) quadrant
    },
    archetypes: {},
    transactions: {
        setDoc(t, v: number) {
            t.resources.docRes = v;
        },
        setSetting(t, v: number) {
            t.resources.settingRes = v;
        },
    },
});

describe("Database.create versioning — scoped loads", () => {
    it("a scoped versioned load leaves out-of-scope quadrants untouched (regression)", () => {
        // Author a settings-only (non-shared) document.
        const author = Database.create(scopedPlugin);
        author.transactions.setSetting(5);
        const settingsDoc = author.toData({ scope: { nonShared: true } });

        // Target already holds shared-quadrant state; accept-all version handler.
        const target = Database.create(scopedPlugin, { versioning: (scratch) => scratch });
        target.transactions.setDoc(42);

        target.fromData(settingsDoc, { nonShared: true });

        // The settings quadrant loaded; the shared quadrant is preserved — not
        // clobbered by the scratch's out-of-scope defaults (docRes would be 0 if
        // the commit serialized the whole scratch instead of the scoped quadrant).
        expect(target.resources.settingRes).toBe(5);
        expect(target.resources.docRes).toBe(42);
    });
});
