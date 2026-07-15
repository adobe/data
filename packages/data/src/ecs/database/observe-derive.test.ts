// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it, beforeEach, vi } from "vitest";
import { Database } from "./database.js";
import { Entity } from "../entity/entity.js";

const createTestDatabase = () =>
    Database.create(
        Database.Plugin.create({
            components: {
                a: { type: "number" },
                b: { type: "number" },
            },
            resources: {
                r: { type: "number", default: 0 },
            },
            archetypes: {
                Foo: ["a", "b"],
            },
            indexes: {
                byA: { key: "a" },
            },
            transactions: {
                makeFoo(store, args: { a: number; b: number }) {
                    return store.archetypes.Foo.insert(args);
                },
                setA(store, args: { e: Entity; a: number }) {
                    store.update(args.e, { a: args.a });
                },
                setB(store, args: { e: Entity; b: number }) {
                    store.update(args.e, { b: args.b });
                },
                setR(store, args: { r: number }) {
                    store.resources.r = args.r;
                },
            },
        }),
    );

const flush = () => new Promise<void>((resolve) => queueMicrotask(() => resolve()));

describe("db.observe.derive", () => {
    let db: ReturnType<typeof createTestDatabase>;
    let foo: Entity;

    beforeEach(() => {
        db = createTestDatabase();
        foo = db.transactions.makeFoo({ a: 1, b: 10 });
    });

    it("emits the initial computed value synchronously on subscribe", () => {
        const observer = vi.fn();
        const unsubscribe = db.observe.derive((d) => d.get(foo, "a"))(observer);
        expect(observer).toHaveBeenCalledTimes(1);
        expect(observer).toHaveBeenLastCalledWith(1);
        unsubscribe();
    });

    it("re-emits when a component it read changes", async () => {
        const observer = vi.fn();
        const unsubscribe = db.observe.derive((d) => d.get(foo, "a"))(observer);
        db.transactions.setA({ e: foo, a: 2 });
        await flush();
        expect(observer).toHaveBeenCalledTimes(2);
        expect(observer).toHaveBeenLastCalledWith(2);
        unsubscribe();
    });

    it("does NOT re-emit when a component it did not read changes (projection read scopes the deps)", async () => {
        const observer = vi.fn();
        // reads only `a` via the projection read
        const unsubscribe = db.observe.derive((d) => d.read(foo, ["a"])?.a ?? -1)(observer);
        expect(observer).toHaveBeenCalledTimes(1);
        db.transactions.setB({ e: foo, b: 99 }); // b is unread
        await flush();
        expect(observer).toHaveBeenCalledTimes(1); // still only the initial emission
        db.transactions.setA({ e: foo, a: 3 }); // a IS read
        await flush();
        expect(observer).toHaveBeenCalledTimes(2);
        expect(observer).toHaveBeenLastCalledWith(3);
        unsubscribe();
    });

    it("a whole-entity read re-emits on any component change of that entity", async () => {
        const observer = vi.fn();
        const unsubscribe = db.observe.derive((d) => d.read(foo)?.b ?? -1)(observer);
        db.transactions.setB({ e: foo, b: 77 });
        await flush();
        expect(observer).toHaveBeenLastCalledWith(77);
        unsubscribe();
    });

    it("structurally dedupes: an input change that yields an equal result does not re-emit", async () => {
        const observer = vi.fn();
        // sign of `a` — 1 and 5 both map to "pos"
        const unsubscribe = db.observe.derive((d) => ((d.get(foo, "a") ?? 0) > 0 ? "pos" : "neg"))(observer);
        expect(observer).toHaveBeenCalledTimes(1);
        expect(observer).toHaveBeenLastCalledWith("pos");
        db.transactions.setA({ e: foo, a: 5 }); // still positive
        await flush();
        expect(observer).toHaveBeenCalledTimes(1); // recomputed to "pos" === "pos" → suppressed
        db.transactions.setA({ e: foo, a: -1 }); // flips
        await flush();
        expect(observer).toHaveBeenCalledTimes(2);
        expect(observer).toHaveBeenLastCalledWith("neg");
        unsubscribe();
    });

    it("re-emits on membership change of a select it read", async () => {
        const observer = vi.fn();
        const unsubscribe = db.observe.derive((d) => d.select(["a"]).length)(observer);
        expect(observer).toHaveBeenLastCalledWith(1);
        db.transactions.makeFoo({ a: 100, b: 0 });
        await flush();
        expect(observer).toHaveBeenLastCalledWith(2);
        unsubscribe();
    });

    it("re-emits on a change to a resource it read", async () => {
        const observer = vi.fn();
        const unsubscribe = db.observe.derive((d) => d.resources.r)(observer);
        expect(observer).toHaveBeenLastCalledWith(0);
        db.transactions.setR({ r: 42 });
        await flush();
        expect(observer).toHaveBeenLastCalledWith(42);
        unsubscribe();
    });

    it("re-emits on a change to an index bucket it read", async () => {
        const observer = vi.fn();
        const unsubscribe = db.observe.derive((d) => d.indexes.byA.find({ a: 1 }).length)(observer);
        expect(observer).toHaveBeenLastCalledWith(1);
        db.transactions.makeFoo({ a: 1, b: 0 }); // another entity in bucket a=1
        await flush();
        expect(observer).toHaveBeenLastCalledWith(2);
        unsubscribe();
    });

    it("recomputes synchronously, at most once per committed transaction", () => {
        const observer = vi.fn();
        const unsubscribe = db.observe.derive((d) => d.read(foo))(observer);
        observer.mockClear();
        // Each transaction fires exactly one synchronous recompute at its commit
        // boundary (no await needed) — the cadence a per-commit consumer relies on.
        db.transactions.setA({ e: foo, a: 8 });
        expect(observer).toHaveBeenCalledTimes(1);
        db.transactions.setB({ e: foo, b: 9 });
        expect(observer).toHaveBeenCalledTimes(2);
        unsubscribe();
    });

    it("stops emitting after unsubscribe", async () => {
        const observer = vi.fn();
        const unsubscribe = db.observe.derive((d) => d.get(foo, "a"))(observer);
        unsubscribe();
        observer.mockClear();
        db.transactions.setA({ e: foo, a: 123 });
        await flush();
        expect(observer).not.toHaveBeenCalled();
    });
});
