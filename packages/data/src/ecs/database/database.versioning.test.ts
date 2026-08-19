// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Tests for the pluggable load-time version handler injected via
// `Database.create(plugin, { versioning: { resource, handle } })`. The snapshot
// is reconstructed into a bare document store (the document's OWN schema); the
// library reads the document + current versions and hands them, with the
// documentStore, to a pure upgrade `handle` that returns a store to commit or `null`
// to reject. The library auto-stamps the committed version; a returned store
// whose typed buffers are storage-incompatible with the current schema throws.

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

// Handler for an app at `currentVersion`: rejects newer documents (null),
// upgrades older ones (declare `b`, add it to every `a` entity), and accepts
// same-version documents. The library stamps the version — the handler doesn't.
const makeVersioning = (currentVersion: number): DatabaseVersioning => ({
    resource: "databaseVersion",
    handle: ({ documentStore, documentVersion }) => {
        if (documentVersion > currentVersion) return null; // reject: too new
        if (documentVersion < currentVersion) {
            (documentStore as any).extend({ components: { b: numeric }, resources: {}, archetypes: {} });
            for (const arch of (documentStore as any).queryArchetypes(["a"])) {
                for (let i = arch.rowCount - 1; i >= 0; i--) {
                    (documentStore as any).update(arch.columns.id.get(i), { b: 100 });
                }
            }
        }
        return documentStore;
    },
});

describe("Database.create versioning (document-store loader)", () => {
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

    it("upgrades an older document (adds a component) and the library stamps the current version", () => {
        const source = Database.create(makePlugin(1)); // document at v1
        const e = source.transactions.addA({ a: 5 }); // entity in [a]
        const snap = source.toData();

        const target = Database.create(makePlugin(2), { versioning: makeVersioning(2) }); // app at v2
        target.fromData(snap);

        expect(target.read(e)).toEqual({ a: 5, b: 100 });
        expect(target.select(["b"])).toContain(e);
        expect(target.resources.databaseVersion).toBe(2); // auto-stamped
    });

    it("treats a pre-versioning document (no version resource) as documentVersion 0", () => {
        // A document authored before the app had a version resource at all.
        const legacyPlugin = Database.Plugin.create({
            components: { a: numeric },
            resources: {}, // no databaseVersion
            archetypes: { A: ["a"] } as const,
            transactions: { addA(t, args: { a: number }) { return t.archetypes.A.insert(args); } },
        });
        const author = Database.create(legacyPlugin);
        const e = author.transactions.addA({ a: 5 });
        const snap = author.toData();

        let seenDocumentVersion = -1;
        const versioning: DatabaseVersioning = {
            resource: "databaseVersion",
            handle: ({ documentStore, documentVersion }) => {
                seenDocumentVersion = documentVersion;
                return documentStore;
            },
        };
        const target = Database.create(makePlugin(1), { versioning });
        target.fromData(snap);

        expect(seenDocumentVersion).toBe(0); // absent version ⇒ 0
        expect(target.read(e)).toEqual({ a: 5 });
        expect(target.resources.databaseVersion).toBe(1); // lands at current version
    });

    it("with no versioning option, fromData loads directly as before", () => {
        const source = Database.create(makePlugin(1));
        const e = source.transactions.addA({ a: 7 });
        const snap = source.toData();

        const target = Database.create(makePlugin(1));
        target.fromData(snap);

        expect(target.read(e)).toEqual({ a: 7 });
    });

    it("commits a different store than the documentStore when the handler returns one", () => {
        const source = Database.create(makePlugin(1));
        source.transactions.addA({ a: 1 });
        const snap = source.toData();

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

describe("Database.create versioning — typed-buffer compatibility", () => {
    it("drops a foreign (app-undeclared) component on commit — adopts no schema", () => {
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
        const e = author.transactions.add({ a: 5, extra: 7 });
        const snap = author.toData();

        const appPlugin = Database.Plugin.create({
            components: { a: numeric },
            resources: { databaseVersion: { default: 1 } },
            archetypes: { A: ["a"] } as const,
        });
        // A lazy migration that forgets to shed `extra` still must not pollute the
        // current-schema database — the commit copies only declared components.
        const versioning: DatabaseVersioning = { resource: "databaseVersion", handle: ({ documentStore }) => documentStore };
        const target = Database.create(appPlugin, { versioning });
        target.fromData(snap);

        expect(target.read(e)).toEqual({ a: 5 }); // `extra` dropped, not adopted
        expect(target.componentSchemas).not.toHaveProperty("extra"); // no schema adopted
    });

    it("throws when a returned component has an incompatible storage layout (e.g. F64→F32)", () => {
        // v1 stores `n` as a full-precision number (Float64, 8 bytes); v2 as a
        // single-precision number (Float32, 4 bytes) — a real storage change, the
        // moral equivalent of a U16→U32 widening.
        const nV1 = { type: "number", default: 0 } as const satisfies Schema;
        const nV2 = { type: "number", precision: 1, default: 0 } as const satisfies Schema;
        const v1Plugin = Database.Plugin.create({
            components: { n: nV1 },
            resources: { databaseVersion: { default: 1 } },
            archetypes: { N: ["n"] } as const,
            transactions: { add(t, v: number) { return t.archetypes.N.insert({ n: v }); } },
        });
        const author = Database.create(v1Plugin);
        author.transactions.add(1);
        const snap = author.toData();

        const v2Plugin = Database.Plugin.create({
            components: { n: nV2 },
            resources: { databaseVersion: { default: 2 } },
            archetypes: { N: ["n"] } as const,
            transactions: { add(t, v: number) { return t.archetypes.N.insert({ n: v }); } },
        });
        // Buggy handler: returns `n` at the old (wider) storage.
        const versioning: DatabaseVersioning = { resource: "databaseVersion", handle: ({ documentStore }) => documentStore };
        const target = Database.create(v2Plugin, { versioning });
        const kept = target.transactions.add(7); // pre-existing live data

        expect(() => target.fromData(snap)).toThrow(/incompatible storage layout/);
        // The throw precedes the commit — the live database is untouched.
        expect(target.select(["n"])).toEqual([kept]);
        expect(target.read(kept)).toEqual({ n: 7 });
    });

    it("throws when a value-type (struct) component is the same size but a different layout", () => {
        // Both are 8-byte structs of two f32 fields, but the fields are reordered
        // (x@0,y@4 vs y@0,x@4) — same size, incompatible binary layout.
        const f32 = { type: "number", precision: 1, default: 0 } as const satisfies Schema;
        const posV1 = { type: "object", properties: { x: f32, y: f32 } } as const satisfies Schema;
        const posV2 = { type: "object", properties: { y: f32, x: f32 } } as const satisfies Schema;
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
        const versioning: DatabaseVersioning = { resource: "databaseVersion", handle: ({ documentStore }) => documentStore };
        const target = Database.create(v2Plugin, { versioning });

        expect(() => target.fromData(snap)).toThrow(/different struct layout/);
    });

    it("allows a component whose only difference is its default (not a storage change)", () => {
        const authorPlugin = Database.Plugin.create({
            components: { a: { type: "number", default: 0 } as const satisfies Schema },
            resources: { databaseVersion: { default: 1 } },
            archetypes: { A: ["a"] } as const,
            transactions: { add(t, v: number) { return t.archetypes.A.insert({ a: v }); } },
        });
        const author = Database.create(authorPlugin);
        const e = author.transactions.add(5);
        const snap = author.toData();

        // Same storage (both Float64), only the default changed — no throw.
        const appPlugin = Database.Plugin.create({
            components: { a: { type: "number", default: 99 } as const satisfies Schema },
            resources: { databaseVersion: { default: 1 } },
            archetypes: { A: ["a"] } as const,
        });
        const versioning: DatabaseVersioning = { resource: "databaseVersion", handle: ({ documentStore }) => documentStore };
        const target = Database.create(appPlugin, { versioning });
        target.fromData(snap);

        expect(target.read(e)).toEqual({ a: 5 });
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

describe("Database.create versioning — scoped loads bypass versioning", () => {
    it("a scoped load bypasses the handler and loads directly, isolating quadrants", () => {
        const author = Database.create(scopedPlugin);
        author.transactions.setSetting(5);
        const settingsDoc = author.toData({ scope: { nonShared: true } });

        let handlerCalled = false;
        const target = Database.create(scopedPlugin, {
            versioning: {
                resource: "databaseVersion",
                handle: ({ documentStore }) => {
                    handlerCalled = true;
                    return documentStore;
                },
            },
        });
        target.transactions.setDoc(42);

        target.fromData(settingsDoc, { nonShared: true });

        expect(handlerCalled).toBe(false); // scoped ⇒ versioning bypassed
        expect(target.resources.settingRes).toBe(5); // settings quadrant loaded
        expect(target.resources.docRes).toBe(42); // document quadrant untouched
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

        const appPlugin = Database.Plugin.create({
            components: { a: numeric },
            resources: { databaseVersion: { default: 2 } },
            archetypes: { A: ["a"] } as const,
        });
        const versioning: DatabaseVersioning = {
            resource: "databaseVersion",
            handle: ({ documentStore }) => {
                for (const arch of (documentStore as any).queryArchetypes(["legacy"])) {
                    for (let i = arch.rowCount - 1; i >= 0; i--) {
                        (documentStore as any).update(arch.columns.id.get(i), { legacy: undefined });
                    }
                }
                return documentStore;
            },
        };
        const target = Database.create(appPlugin, { versioning });
        target.fromData(snap);

        expect(target.read(e)).toEqual({ a: 5 });
        expect((target as any).select(["legacy"]).length).toBe(0);
    });

    it("reseeds a declared index on the live database after a versioned upgrade commit", () => {
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
