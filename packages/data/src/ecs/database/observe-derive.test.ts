// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it, beforeEach, vi } from "vitest";
import { Database } from "./database.js";
import { Entity } from "../entity/entity.js";
import { Observe } from "../../observe/index.js";

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

// A minimal external (non-ECS) observable, standing in for a value a service
// might expose: emits the current value on subscribe, re-emits on `set`.
const makeSource = <T>(initial: T) => {
    let value = initial;
    const observers = new Set<(v: T) => void>();
    const observe: Observe<T> = (notify) => {
        observers.add(notify);
        notify(value);
        return () => {
            observers.delete(notify);
        };
    };
    const set = (v: T) => {
        value = v;
        for (const o of observers) o(v);
    };
    return { observe, set };
};

describe("db.derive", () => {
    let db: ReturnType<typeof createTestDatabase>;
    let foo: Entity;

    beforeEach(() => {
        db = createTestDatabase();
        foo = db.transactions.makeFoo({ a: 1, b: 10 });
    });

    it("emits the initial computed value synchronously on subscribe", () => {
        const observer = vi.fn();
        const unsubscribe = db.derive((d) => d.get(foo, "a"))(observer);
        expect(observer).toHaveBeenCalledTimes(1);
        expect(observer).toHaveBeenLastCalledWith(1);
        unsubscribe();
    });

    it("re-emits when a component it read changes", async () => {
        const observer = vi.fn();
        const unsubscribe = db.derive((d) => d.get(foo, "a"))(observer);
        db.transactions.setA({ e: foo, a: 2 });
        await flush();
        expect(observer).toHaveBeenCalledTimes(2);
        expect(observer).toHaveBeenLastCalledWith(2);
        unsubscribe();
    });

    it("does NOT re-emit when a component it did not read changes (projection read scopes the deps)", async () => {
        const observer = vi.fn();
        // reads only `a` via the projection read
        const unsubscribe = db.derive((d) => d.read(foo, ["a"])?.a ?? -1)(observer);
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
        const unsubscribe = db.derive((d) => d.read(foo)?.b ?? -1)(observer);
        db.transactions.setB({ e: foo, b: 77 });
        await flush();
        expect(observer).toHaveBeenLastCalledWith(77);
        unsubscribe();
    });

    it("structurally dedupes: an input change that yields an equal result does not re-emit", async () => {
        const observer = vi.fn();
        // sign of `a` — 1 and 5 both map to "pos"
        const unsubscribe = db.derive((d) => ((d.get(foo, "a") ?? 0) > 0 ? "pos" : "neg"))(observer);
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
        const unsubscribe = db.derive((d) => d.select(["a"]).length)(observer);
        expect(observer).toHaveBeenLastCalledWith(1);
        db.transactions.makeFoo({ a: 100, b: 0 });
        await flush();
        expect(observer).toHaveBeenLastCalledWith(2);
        unsubscribe();
    });

    it("re-emits on a change to a resource it read", async () => {
        const observer = vi.fn();
        const unsubscribe = db.derive((d) => d.resources.r)(observer);
        expect(observer).toHaveBeenLastCalledWith(0);
        db.transactions.setR({ r: 42 });
        await flush();
        expect(observer).toHaveBeenLastCalledWith(42);
        unsubscribe();
    });

    // ── inputs overload: fold external (non-ECS) observables into a derive ──

    it("injects external input values and recomputes when either an input or an ECS read changes", () => {
        const scale = makeSource(2);
        const observer = vi.fn();
        // one body reads an ECS value (`a` on foo) AND the injected external input
        const unsubscribe = db.derive(
            { scale: scale.observe },
            (d, inputs) => (d.get(foo, "a") ?? 0) * inputs.scale,
        )(observer);
        expect(observer).toHaveBeenLastCalledWith(2); // a=1 * scale=2
        db.transactions.setA({ e: foo, a: 5 }); // ECS dep changed
        expect(observer).toHaveBeenLastCalledWith(10); // 5 * 2 (latest input reused)
        scale.set(3); // external input changed
        expect(observer).toHaveBeenLastCalledWith(15); // 5 * 3 (latest ECS read reused)
        unsubscribe();
    });

    it("combines two external inputs with an ECS index read", () => {
        db.transactions.makeFoo({ a: 1, b: 0 }); // bucket a=1 now holds 2 entities
        const weight = makeSource(10);
        const label = makeSource("count");
        const observer = vi.fn();
        const unsubscribe = db.derive(
            { weight: weight.observe, label: label.observe },
            (d, inputs) => `${inputs.label}=${d.indexes.byA.find({ a: 1 }).length * inputs.weight}`,
        )(observer);
        expect(observer).toHaveBeenLastCalledWith("count=20"); // 2 entities * 10
        weight.set(100);
        expect(observer).toHaveBeenLastCalledWith("count=200");
        label.set("total");
        expect(observer).toHaveBeenLastCalledWith("total=200");
        unsubscribe();
    });

    it("withholds the first value until every input has emitted", () => {
        // an input that does not emit synchronously on subscribe
        let emitInput: ((v: number) => void) | undefined;
        const deferred: Observe<number> = (notify) => {
            emitInput = notify;
            return () => {
                emitInput = undefined;
            };
        };
        const observer = vi.fn();
        const unsubscribe = db.derive({ d: deferred }, (_db, inputs) => inputs.d + 1)(observer);
        expect(observer).not.toHaveBeenCalled(); // no input value yet → nothing computed
        emitInput?.(10);
        expect(observer).toHaveBeenCalledTimes(1);
        expect(observer).toHaveBeenLastCalledWith(11);
        unsubscribe();
    });

    it("structurally dedupes across input changes", () => {
        const flag = makeSource(1);
        const compute = vi.fn((_db: any, inputs: { flag: number }) => (inputs.flag > 0 ? "pos" : "neg"));
        const observer = vi.fn();
        const unsubscribe = db.derive({ flag: flag.observe }, compute)(observer);
        expect(observer).toHaveBeenCalledTimes(1); // "pos"
        flag.set(5); // still positive → recompute runs but result unchanged → no emit
        expect(compute).toHaveBeenCalledTimes(2);
        expect(observer).toHaveBeenCalledTimes(1);
        flag.set(-1); // flips
        expect(observer).toHaveBeenCalledTimes(2);
        expect(observer).toHaveBeenLastCalledWith("neg");
        unsubscribe();
    });

    it("re-emits on a change to an index bucket it read", async () => {
        const observer = vi.fn();
        const unsubscribe = db.derive((d) => d.indexes.byA.find({ a: 1 }).length)(observer);
        expect(observer).toHaveBeenLastCalledWith(1);
        db.transactions.makeFoo({ a: 1, b: 0 }); // another entity in bucket a=1
        await flush();
        expect(observer).toHaveBeenLastCalledWith(2);
        unsubscribe();
    });

    it("index read is bucket-precise: a change to a different bucket does not re-run the body", () => {
        // `compute` counts body runs; the per-dep recompute of `find` inside
        // `affected` is separate, so this distinguishes "body re-ran, deduped"
        // from "body never re-ran".
        const compute = vi.fn((d: any) => d.indexes.byA.find({ a: 1 }).length);
        const unsubscribe = db.derive(compute)(() => {});
        expect(compute).toHaveBeenCalledTimes(1);
        db.transactions.makeFoo({ a: 2, b: 0 }); // a DIFFERENT bucket (a=2)
        expect(compute).toHaveBeenCalledTimes(1); // bucket a=1 unchanged → body not re-run
        db.transactions.makeFoo({ a: 1, b: 0 }); // OUR bucket (a=1)
        expect(compute).toHaveBeenCalledTimes(2); // body re-run
        unsubscribe();
    });

    it("presence select is membership-precise: a value write to a selected column does not re-run the body", () => {
        const compute = vi.fn((d: any) => d.select(["a"]).length);
        const unsubscribe = db.derive(compute)(() => {});
        expect(compute).toHaveBeenCalledTimes(1);
        db.transactions.setA({ e: foo, a: 999 }); // value write, membership unchanged
        expect(compute).toHaveBeenCalledTimes(1); // no archetype migration → body not re-run
        db.transactions.makeFoo({ a: 5, b: 0 }); // new Foo → membership changes
        expect(compute).toHaveBeenCalledTimes(2); // body re-run
        unsubscribe();
    });

    it("recomputes synchronously, at most once per committed transaction", () => {
        const observer = vi.fn();
        const unsubscribe = db.derive((d) => d.read(foo))(observer);
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
        const unsubscribe = db.derive((d) => d.get(foo, "a"))(observer);
        unsubscribe();
        observer.mockClear();
        db.transactions.setA({ e: foo, a: 123 });
        await flush();
        expect(observer).not.toHaveBeenCalled();
    });
});
