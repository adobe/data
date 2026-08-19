// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Tests for the pluggable load-time version handler injected via
// `Database.create(plugin, { versioning: { resource, handle } })`. The snapshot
// is reconstructed into a bare scratch store (the document's OWN schema); the
// library reads the document + current versions and hands them, with the
// scratch, to a pure upgrade `handle` that returns a store to commit or `null`
// to reject. The returned store's schema is strictly validated against the
// current database's (a mismatch throws — a developer error).

import { describe, it, expect } from "vitest";
import { Database } from "./database.js";
import type { DatabaseVersioning } from "./public/create-database.js";
import type { Store } from "../store/store.js";
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

// A bare reconstruction has no resource accessor, so read/write the version via
// its raw singleton — exactly the "verbose technique" the library uses.
const stampVersion = (s: Store<any, any, any>, name: string, v: number) => {
    const arch = (s as any).queryArchetypes([name])[0];
    (s as any).update(arch.columns.id.get(0), { [name]: v });
};

// Handler for an app at `currentVersion`: rejects newer documents (null),
// upgrades older ones (declare `b`, add it to every `a` entity, stamp the
// version), and accepts same-version documents (return the scratch).
const makeVersioning = (currentVersion: number): DatabaseVersioning => ({
    resource: "databaseVersion",
    handle: ({ scratch, documentVersion }) => {
        if (documentVersion > currentVersion) return null; // reject: too new
        if (documentVersion < currentVersion) {
            (scratch as any).extend({ components: { b: numeric }, resources: {}, archetypes: {} });
            for (const arch of (scratch as any).queryArchetypes(["a"])) {
                for (let i = arch.rowCount - 1; i >= 0; i--) {
                    (scratch as any).update(arch.columns.id.get(i), { b: 100 });
                }
            }
            stampVersion(scratch, "databaseVersion", currentVersion);
        }
        return scratch;
    },
});

describe("Database.create versioning (bare-scratch loader)", () => {
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

        const target = Database.create(makePlugin(1), { versioning: makeVersioning(1) });
        const kept = target.transactions.addA({ a: 99 });

        target.fromData(snap); // documentVersion 2 > currentVersion 1 → null

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

        // Handler ignores the scratch and commits a store it built itself (already
        // at the current schema, so it passes strict validation).
        const versioning: DatabaseVersioning = {
            resource: "databaseVersion",
            handle: () => {
                const fresh = Database.create(makePlugin(1));
                fresh.transactions.addA({ a: 999 });
                return (fresh as any).store;
            },
        };
        const target = Database.create(makePlugin(1), { versioning });
        target.fromData(snap);

        expect(target.select(["a"]).map((x) => target.read(x)?.a)).toEqual([999]);
    });
});

describe("Database.create versioning — strict schema validation", () => {
    it("throws when the returned store declares a component the current database does not", () => {
        // Document carries an `extra` component the loading app doesn't declare;
        // an accept-all handler returns the scratch with `extra` still present.
        const authorPlugin = Database.Plugin.create({
            components: { a: numeric, extra: numeric },
            resources: { databaseVersion: { default: 1 } },
            archetypes: { AExtra: ["a", "extra"] } as const,
            transactions: {
                add(t, args: { a: number; extra: number }) {
                    return t.archetypes.AExtra.insert(args);
                },
            },
        });
        const author = Database.create(authorPlugin);
        author.transactions.add({ a: 5, extra: 7 });
        const snap = author.toData();

        const appPlugin = Database.Plugin.create({
            components: { a: numeric },
            resources: { databaseVersion: { default: 1 } },
            archetypes: { A: ["a"] } as const,
        });
        const versioning: DatabaseVersioning = { resource: "databaseVersion", handle: ({ scratch }) => scratch };
        const target = Database.create(appPlugin, { versioning });

        expect(() => target.fromData(snap)).toThrow(/does not|extra/);
    });

    it("throws when the returned store keeps an old, structurally-different schema for a shared component", () => {
        // v1 document stores `pos` as { x, y }; v2 app stores { x, y, z }. A
        // migration that returns the document un-transformed leaves `pos` at the
        // old schema — a developer error.
        const posV1 = { type: "object", properties: { x: numeric, y: numeric } } as const satisfies Schema;
        const posV2 = { type: "object", properties: { x: numeric, y: numeric, z: numeric } } as const satisfies Schema;
        const v1Plugin = Database.Plugin.create({
            components: { pos: posV1 },
            resources: { databaseVersion: { default: 1 } },
            archetypes: { P: ["pos"] } as const,
            transactions: { add(t, p: { x: number; y: number }) { return t.archetypes.P.insert({ pos: p }); } },
        });
        const author = Database.create(v1Plugin);
        author.transactions.add({ x: 1, y: 2 });
        const snap = author.toData();

        const v2Plugin = Database.Plugin.create({
            components: { pos: posV2 },
            resources: { databaseVersion: { default: 2 } },
            archetypes: { P: ["pos"] } as const,
        });
        // Buggy handler: returns the scratch without upgrading `pos`.
        const versioning: DatabaseVersioning = { resource: "databaseVersion", handle: ({ scratch }) => scratch };
        const target = Database.create(v2Plugin, { versioning });

        expect(() => target.fromData(snap)).toThrow(/structurally equivalent|pos/);
    });
});

// A settings/document split so a scoped load exercises quadrant isolation.
const scopedPlugin = Database.Plugin.create({
    components: {},
    resources: {
        docRes: { default: 0 as number }, // shared (document) quadrant
        settingRes: { default: 1 as number, nonShared: true }, // non-shared (settings) quadrant
        databaseVersion: { default: 1 as number },
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
        const author = Database.create(scopedPlugin);
        author.transactions.setSetting(5);
        const settingsDoc = author.toData({ scope: { nonShared: true } });

        const target = Database.create(scopedPlugin, {
            versioning: { resource: "databaseVersion", handle: ({ scratch }) => scratch },
        });
        target.transactions.setDoc(42);

        target.fromData(settingsDoc, { nonShared: true });

        expect(target.resources.settingRes).toBe(5);
        expect(target.resources.docRes).toBe(42);
    });
});

describe("Database.create versioning — migration shapes", () => {
    it("a migration that drops a component removes it from the committed document", () => {
        const authorPlugin = Database.Plugin.create({
            components: { a: numeric, legacy: numeric },
            resources: { databaseVersion: { default: 1 } },
            archetypes: { ALegacy: ["a", "legacy"] } as const,
            transactions: {
                add(t, args: { a: number; legacy: number }) {
                    return t.archetypes.ALegacy.insert(args);
                },
            },
        });
        const author = Database.create(authorPlugin);
        const e = author.transactions.add({ a: 5, legacy: 9 });
        const snap = author.toData();

        // App v2 removed `legacy`; the migration drops it from every entity. The
        // now-inert `legacy` schema is not validated (no data carries it) and is
        // shed on commit.
        const appPlugin = Database.Plugin.create({
            components: { a: numeric },
            resources: { databaseVersion: { default: 2 } },
            archetypes: { A: ["a"] } as const,
        });
        const versioning: DatabaseVersioning = {
            resource: "databaseVersion",
            handle: ({ scratch }) => {
                for (const arch of (scratch as any).queryArchetypes(["legacy"])) {
                    for (let i = arch.rowCount - 1; i >= 0; i--) {
                        (scratch as any).update(arch.columns.id.get(i), { legacy: undefined });
                    }
                }
                stampVersion(scratch, "databaseVersion", 2);
                return scratch;
            },
        };
        const target = Database.create(appPlugin, { versioning });
        target.fromData(snap);

        expect(target.read(e)).toEqual({ a: 5 });
        // `legacy` isn't a declared component of the v2 app (that's the point) —
        // query it structurally to confirm no entity carries it.
        expect((target as any).select(["legacy"]).length).toBe(0);
    });

    it("reseeds a declared index on the live database after a versioned upgrade commit", () => {
        // v1 document: entity in [a], no b, version 1.
        const author = Database.create(
            Database.Plugin.create({
                components: { a: numeric },
                resources: { databaseVersion: { default: 1 } },
                archetypes: { A: ["a"] } as const,
                transactions: {
                    addA(t, args: { a: number }) {
                        return t.archetypes.A.insert(args);
                    },
                },
            }),
        );
        const e = author.transactions.addA({ a: 5 });
        const snap = author.toData();

        // App v2 declares an index on the added component `b`.
        const v2Plugin = Database.Plugin.create({
            components: { a: numeric, b: numeric },
            resources: { databaseVersion: { default: 2 } },
            archetypes: { A: ["a"], AB: ["a", "b"] } as const,
            indexes: { byB: { key: "b" } },
            transactions: {
                addA(t, args: { a: number }) {
                    return t.archetypes.A.insert(args);
                },
            },
        });
        const target = Database.create(v2Plugin, { versioning: makeVersioning(2) });
        target.fromData(snap);

        expect(target.indexes.byB.find({ b: 100 })).toContain(e);
    });
});
