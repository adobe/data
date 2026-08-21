// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Tests for the pluggable load-time version handler injected via
// `Database.create(plugin, { versioning: { currentVersion, handle } })`. The snapshot
// is reconstructed into a bare document store (the document's OWN schema); the version
// each quadrant was saved at comes from the blob's save METADATA (`schemaVersions`, not
// an ECS resource) and is handed, with the documentStore, to a pure upgrade `handle`
// that returns a store to commit or `null` to reject. A returned store whose typed
// buffers are storage-incompatible with the current schema throws.

import { describe, it, expect } from "vitest";
import { Database } from "./database.js";
import type { DatabaseVersioning } from "./public/database-versioning.js";
import type { Schema } from "../../schema/index.js";

const numeric = { type: "number", default: 0 } as const satisfies Schema;

// Stamp a snapshot's save metadata with the version it was "saved at" (both
// quadrants), as a real blob from that app version would carry.
const saveAt = (data: unknown, version: number) => ({ ...(data as object), schemaVersions: { document: version, settings: version } });

const makePlugin = () =>
    Database.Plugin.create({
        components: { a: numeric, b: numeric },
        resources: {},
        archetypes: { A: ["a"], AB: ["a", "b"] } as const,
        transactions: {
            addA(t, args: { a: number }) {
                return t.archetypes.A.insert(args);
            },
        },
    });

// Handler for an app at `currentVersion`: rejects newer documents (null), upgrades
// older ones (declare `b`, add it to every `a` entity), and accepts same-version
// documents. The saved version comes from the blob metadata (`schemaVersions`).
const makeVersioning = (currentVersion: number): DatabaseVersioning => ({
    currentVersion,
    handle: ({ documentStore, schemaVersions }) => {
        if (schemaVersions.document > currentVersion) return null; // reject: too new
        if (schemaVersions.document < currentVersion) {
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
    it("accepts a same-version document", async () => {
        const source = Database.create(makePlugin());
        const e = source.transactions.addA({ a: 5 });
        const snap = saveAt(source.toData(), 1);

        const target = Database.create(makePlugin(), { versioning: makeVersioning(1) });
        await target.fromData(snap);

        expect(target.read(e)).toEqual({ a: 5 });
        expect(target.version).toBe(1);
    });

    it("rejects a newer document non-destructively — the live database is untouched", async () => {
        const source = Database.create(makePlugin());
        source.transactions.addA({ a: 5 });
        const snap = saveAt(source.toData(), 2); // saved at v2

        const target = Database.create(makePlugin(), { versioning: makeVersioning(1) });
        const kept = target.transactions.addA({ a: 99 });

        await target.fromData(snap); // document version 2 > currentVersion 1 → null

        expect(target.select(["a"])).toEqual([kept]);
        expect(target.read(kept)).toEqual({ a: 99 });
        expect(target.version).toBe(1);
    });

    it("upgrades an older document (adds a component)", async () => {
        const source = Database.create(makePlugin());
        const e = source.transactions.addA({ a: 5 }); // entity in [a]
        const snap = saveAt(source.toData(), 1); // saved at v1

        const target = Database.create(makePlugin(), { versioning: makeVersioning(2) }); // app at v2
        await target.fromData(snap);

        expect(target.read(e)).toEqual({ a: 5, b: 100 });
        expect(target.select(["b"])).toContain(e);
        expect(target.version).toBe(2);
    });

    it("treats a pre-versioning document (no save metadata) as version 0", async () => {
        // A document authored before the app carried any version metadata at all.
        const author = Database.create(makePlugin());
        const e = author.transactions.addA({ a: 5 });
        const snap = author.toData();
        delete (snap as any).schemaVersions; // truly legacy: no version metadata

        let seenDocumentVersion = -1;
        const versioning: DatabaseVersioning = {
            currentVersion: 1,
            handle: ({ documentStore, schemaVersions }) => {
                seenDocumentVersion = schemaVersions.document;
                return documentStore;
            },
        };
        const target = Database.create(makePlugin(), { versioning });
        await target.fromData(snap);

        expect(seenDocumentVersion).toBe(0); // absent metadata ⇒ 0
        expect(target.read(e)).toEqual({ a: 5 });
        expect(target.version).toBe(1);
    });

    it("with no versioning option, fromData loads directly as before", async () => {
        const source = Database.create(makePlugin());
        const e = source.transactions.addA({ a: 7 });
        const snap = source.toData();

        const target = Database.create(makePlugin());
        await target.fromData(snap);

        expect(target.read(e)).toEqual({ a: 7 });
        expect(target.version).toBe(0); // unversioned db
    });

    it("commits a different store than the documentStore when the handler returns one", async () => {
        const source = Database.create(makePlugin());
        source.transactions.addA({ a: 1 });
        const snap = source.toData();

        const versioning: DatabaseVersioning = {
            currentVersion: 1,
            handle: () => {
                const fresh = Database.create(makePlugin());
                fresh.transactions.addA({ a: 999 });
                return (fresh as any).store;
            },
        };
        const target = Database.create(makePlugin(), { versioning });
        await target.fromData(snap);

        expect(target.select(["a"]).map((x) => target.read(x)?.a)).toEqual([999]);
    });
});

describe("Database.create versioning — typed-buffer compatibility", () => {
    it("drops a foreign (app-undeclared) component on commit — adopts no schema", async () => {
        const authorPlugin = Database.Plugin.create({
            components: { a: numeric, extra: numeric },
            resources: {},
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
            resources: {},
            archetypes: { A: ["a"] } as const,
        });
        // A lazy migration that forgets to shed `extra` still must not pollute the
        // current-schema database — the commit copies only declared components.
        const versioning: DatabaseVersioning = { currentVersion: 1, handle: ({ documentStore }) => documentStore };
        const target = Database.create(appPlugin, { versioning });
        await target.fromData(snap);

        expect(target.read(e)).toEqual({ a: 5 }); // `extra` dropped, not adopted
        expect(target.componentSchemas).not.toHaveProperty("extra"); // no schema adopted
    });

    it("auto-heals a storage change on commit (F64 document → F32 current)", async () => {
        // v1 stored `n` as Float64; v2 as Float32. The handler returns it as-is;
        // the commit path auto-converts it to the current storage (precision loss),
        // rather than rejecting.
        const nV1 = { type: "number", default: 0 } as const satisfies Schema;
        const nV2 = { type: "number", precision: 1, default: 0 } as const satisfies Schema;
        const v1Plugin = Database.Plugin.create({
            components: { n: nV1 },
            resources: {},
            archetypes: { N: ["n"] } as const,
            transactions: { add(t, v: number) { return t.archetypes.N.insert({ n: v }); } },
        });
        const author = Database.create(v1Plugin);
        const e = author.transactions.add(1); // 1 is exact in f32
        const snap = author.toData();

        const v2Plugin = Database.Plugin.create({
            components: { n: nV2 },
            resources: {},
            archetypes: { N: ["n"] } as const,
        });
        const versioning: DatabaseVersioning = { currentVersion: 2, handle: ({ documentStore }) => documentStore };
        const target = Database.create(v2Plugin, { versioning });
        await target.fromData(snap);

        expect(target.read(e)).toEqual({ n: 1 }); // healed to f32, value preserved
    });

    it("auto-heals a same-size struct field reorder on commit (by field name)", async () => {
        const f32 = { type: "number", precision: 1, default: 0 } as const satisfies Schema;
        const posV1 = { type: "object", properties: { x: f32, y: f32 } } as const satisfies Schema;
        const posV2 = { type: "object", properties: { y: f32, x: f32 } } as const satisfies Schema;
        const v1Plugin = Database.Plugin.create({
            components: { pos: posV1 },
            resources: {},
            archetypes: { P: ["pos"] } as const,
            transactions: { add(t, p: { x: number; y: number }) { return t.archetypes.P.insert({ pos: p }); } },
        });
        const author = Database.create(v1Plugin);
        const e = author.transactions.add({ x: 1, y: 2 });
        const snap = author.toData();

        const v2Plugin = Database.Plugin.create({
            components: { pos: posV2 },
            resources: {},
            archetypes: { P: ["pos"] } as const,
        });
        const versioning: DatabaseVersioning = { currentVersion: 2, handle: ({ documentStore }) => documentStore };
        const target = Database.create(v2Plugin, { versioning });
        await target.fromData(snap);

        expect(target.read(e)).toEqual({ pos: { x: 1, y: 2 } }); // fields remapped by name
    });

    it("throws (backstop) when the committed store keeps a NON-auto-convertible component", async () => {
        // v1 `x` is a number; v2 `x` is an object. A handler that leaves it a
        // number can't be auto-healed → the commit backstop throws, leaving the
        // live database untouched.
        const v1Plugin = Database.Plugin.create({
            components: { x: { type: "number", default: 0 } as Schema },
            resources: {},
            archetypes: { X: ["x"] } as const,
            transactions: { add(t, v: number) { return t.archetypes.X.insert({ x: v }); } },
        });
        const author = Database.create(v1Plugin);
        author.transactions.add(1);
        const snap = author.toData();

        const v2Plugin = Database.Plugin.create({
            components: { x: { type: "object", properties: { v: { type: "number", precision: 1, default: 0 } } } as Schema },
            resources: {},
            archetypes: { X: ["x"] } as const,
            transactions: { add(t, v: { v: number }) { return t.archetypes.X.insert({ x: v }); } },
        });
        const versioning: DatabaseVersioning = { currentVersion: 2, handle: ({ documentStore }) => documentStore };
        const target = Database.create(v2Plugin, { versioning });
        const kept = target.transactions.add({ v: 9 });

        await expect(target.fromData(snap)).rejects.toThrow(/not automatically convertible/);
        expect(target.select(["x"])).toEqual([kept]); // live db untouched
    });

    it("allows a component whose only difference is its default (not a storage change)", async () => {
        const authorPlugin = Database.Plugin.create({
            components: { a: { type: "number", default: 0 } as const satisfies Schema },
            resources: {},
            archetypes: { A: ["a"] } as const,
            transactions: { add(t, v: number) { return t.archetypes.A.insert({ a: v }); } },
        });
        const author = Database.create(authorPlugin);
        const e = author.transactions.add(5);
        const snap = author.toData();

        // Same storage (both Float64), only the default changed — no throw.
        const appPlugin = Database.Plugin.create({
            components: { a: { type: "number", default: 99 } as const satisfies Schema },
            resources: {},
            archetypes: { A: ["a"] } as const,
        });
        const versioning: DatabaseVersioning = { currentVersion: 1, handle: ({ documentStore }) => documentStore };
        const target = Database.create(appPlugin, { versioning });
        await target.fromData(snap);

        expect(target.read(e)).toEqual({ a: 5 });
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

describe("Database.create versioning — scoped loads bypass versioning", () => {
    it("a scoped load bypasses the handler and loads directly, isolating quadrants", async () => {
        const author = Database.create(scopedPlugin);
        author.transactions.setSetting(5);
        const settingsDoc = author.toData({ scope: { nonShared: true } });

        let handlerCalled = false;
        const target = Database.create(scopedPlugin, {
            versioning: {
                currentVersion: 1,
                handle: ({ documentStore }) => {
                    handlerCalled = true;
                    return documentStore;
                },
            },
        });
        target.transactions.setDoc(42);

        await target.fromData(settingsDoc, { nonShared: true });

        expect(handlerCalled).toBe(false); // scoped ⇒ versioning bypassed
        expect(target.resources.settingRes).toBe(5); // settings quadrant loaded
        expect(target.resources.docRes).toBe(42); // document quadrant untouched
    });
});

describe("Database.create versioning — migration shapes", () => {
    it("a migration that drops a component removes it from the committed document", async () => {
        const authorPlugin = Database.Plugin.create({
            components: { a: numeric, legacy: numeric },
            resources: {},
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
            resources: {},
            archetypes: { A: ["a"] } as const,
        });
        const versioning: DatabaseVersioning = {
            currentVersion: 2,
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
        await target.fromData(snap);

        expect(target.read(e)).toEqual({ a: 5 });
        expect((target as any).select(["legacy"]).length).toBe(0);
    });

    it("reseeds a declared index on the live database after a versioned upgrade commit", async () => {
        const author = Database.create(
            Database.Plugin.create({
                components: { a: numeric },
                resources: {},
                archetypes: { A: ["a"] } as const,
                transactions: {
                    addA(t, args: { a: number }) {
                        return t.archetypes.A.insert(args);
                    },
                },
            }),
        );
        const e = author.transactions.addA({ a: 5 });
        const snap = saveAt(author.toData(), 1); // saved at v1

        const v2Plugin = Database.Plugin.create({
            components: { a: numeric, b: numeric },
            resources: {},
            archetypes: { A: ["a"], AB: ["a", "b"] } as const,
            indexes: { byB: { key: "b" } },
            transactions: {
                addA(t, args: { a: number }) {
                    return t.archetypes.A.insert(args);
                },
            },
        });
        const target = Database.create(v2Plugin, { versioning: makeVersioning(2) });
        await target.fromData(snap);

        expect(target.indexes.byB.find({ b: 100 })).toContain(e);
    });
});
