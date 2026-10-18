import { describe, expect, it } from "vitest";
import { Entity } from "../entity/entity.js";
import { declarationOf, kindOf, threadOfDeclaration } from "../registry/index.js";
import { Trait } from "../trait/trait.js";
import { Component } from "./component.js";

const parent = Symbol("typesComponentTest/parent");
const count = Symbol("typesComponentTest/count");
const label = Symbol("typesComponentTest/label");
const placed = Symbol("typesComponentTest/placed");
const position = Symbol("typesComponentTest/position");
const bitmap = Symbol("typesComponentTest/bitmap");
const marked = Symbol("typesComponentTest/marked");
const mark = Symbol("typesComponentTest/mark");
const late = Symbol("typesComponentTest/late");
const slot = Symbol("typesComponentTest/slot");

declare module "@adobe/data-ecs" {
    export interface Threads {
        typesComponentTest: true;
    }
    export interface Components {
        [parent]: typeof parentTraits;
        [count]: typeof countTraits;
        [label]: typeof labelTraits;
        [placed]: typeof placedTraits;
        [position]: typeof positionTraits;
        [bitmap]: typeof bitmapTraits;
        [marked]: typeof markedTraits;
        [slot]: typeof slotTraits;
    }
    export interface Traits<N, E> {
        readonly [mark]: true;
        readonly [late]: true;
    }
}

Trait.register(mark);
const parentTraits = Component.register(parent, { type: Entity.schema, reference: "owner" });
const countTraits = Component.register(count, { type: { type: "number" } });
const labelTraits = Component.register(label, { type: { type: "string" } });
const placedTraits = Component.register(placed, { type: { type: "string" }, thread: "typesComponentTest" });
const positionTraits = Component.register(position, { type: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 } });
const bitmapTraits = Component.register(bitmap, { type: Component.object<ImageBitmap>(), transfer: true });
const markedTraits = Component.register(marked, { type: { const: true }, [mark]: true });
const slotTraits = Component.register(slot, { type: { type: "number", default: 0 }, derived: true });

const untyped: (...parameters: never[]) => unknown = Component.register;

/** Registers as an untyped caller would, bypassing the types' checks. */
const register = (key: unknown, declaration: object): void => {
    Reflect.apply(untyped, undefined, [key, declaration]);
};

describe("Component.register", () => {
    it("records the declaration, and its thread: none for a struct, else its own or \"world\"", () => {
        expect(declarationOf(parent)).toEqual({ type: Entity.schema, reference: "owner" });
        expect(kindOf(parent)).toBe("component");
        expect(threadOfDeclaration({ type: Entity.schema })).toBe(null);
        expect(threadOfDeclaration({ type: { const: true } })).toBe(null);
        expect(threadOfDeclaration({ type: { type: "object", properties: { at: { type: "number" } } } })).toBe(null);
        expect(threadOfDeclaration({ type: { type: "array", items: { type: "number" } } })).toBe("world");
        expect(threadOfDeclaration({ type: { type: "object", properties: { at: { type: "number" } }, required: [] } })).toBe("world");
        expect([parent, label, placed, position].map(name => threadOfDeclaration(declarationOf(name) ?? {}))).toEqual([null, "world", "typesComponentTest", null]);
    });
    it("accepts the same declaration again, as a module evaluated again makes it, and rejects a different one or a key of another kind", () => {
        expect(() => Component.register(count, { type: { type: "number" } })).not.toThrow();
        expect(() => register(count, { type: { type: "integer" } })).toThrow(`Cannot register component "typesComponentTest/count": already registered as a component, with another declaration.`);
        expect(declarationOf(count)).toEqual({ type: { type: "number" } });
        const claimed = Symbol("typesComponentTest/claimed");
        register(claimed, { type: { const: true } });
        expect(() => Reflect.apply(Trait.register, undefined, [claimed])).toThrow(`Cannot register trait "typesComponentTest/claimed": already registered as a component.`);
        expect(kindOf(count)).toBe("component");
    });
    it("takes only plain symbols as keys, so built-in traits' string names are no component's", () => {
        // @ts-expect-error a key is a symbol, and derived is a built-in trait's name
        expect(() => Component.register("derived", { type: { const: true } })).toThrow(`Cannot register component "derived": a key is a plain Symbol(...), not a string.`);
        expect(() => register(Symbol.for("typesComponentTest/shared"), { type: { const: true } })).toThrow("a Symbol.for key is shared across the program");
        expect(() => register(Symbol.asyncIterator, { type: { const: true } })).toThrow("Symbol.asyncIterator is a well-known symbol.");
        expect(kindOf("derived")).toBe(undefined);
    });
    it("rejects what types reject, for untyped callers, recording nothing", () => {
        expect(() => register(Symbol("typesComponentTest/strayTrait"), { type: { type: "number" }, unknown: true })).toThrow("unknown isn't a registered trait");
        expect(() => register(Symbol("typesComponentTest/badReference"), { type: { type: "number" }, reference: "weak" })).toThrow("a reference's type is Entity.schema");
        expect(() => register(Symbol("typesComponentTest/badSlot"), { type: { type: "number" }, derived: true })).toThrow("a derived component's type has a default");
        expect(() => register(Symbol("typesComponentTest/reduced"), { type: { type: "number" }, reduce: "+" })).toThrow("only a resource is reduced");
        const badReference = Symbol("typesComponentTest/badReference");
        expect(() => register(badReference, { type: { type: "number" }, reference: "weak" })).toThrow("a reference's type is Entity.schema");
        expect(declarationOf(badReference)).toBe(undefined);
        expect(kindOf(badReference)).toBe(undefined);
    });
    it("rejects a schema whose GPU layout can't hold it", () => {
        expect(() => register(Symbol("typesComponentTest/storageText"), { type: { type: "array", items: { type: "string" }, layout: "storage" } })).toThrow("layout needs numbers");
    });
    it("checks thread and transfer as far as values tell", () => {
        expect(() => register(Symbol("typesComponentTest/placedStruct"), { type: { type: "number" }, thread: "main" })).toThrow("a struct lives in shared memory, so it has no thread");
        expect(() => register(Symbol("typesComponentTest/placedTag"), { type: { const: true }, thread: "main" })).toThrow("a struct lives in shared memory");
        expect(() => register(Symbol("typesComponentTest/emptyThread"), { thread: "" })).toThrow("thread is a thread's name");
        expect(() => register(Symbol("typesComponentTest/dataTransfer"), { type: { type: "string" }, transfer: true })).toThrow("a value with a schema is data, which isn't Transferable");
        expect(() => register(Symbol("typesComponentTest/falseTransfer"), { transfer: false })).toThrow("transfer is true");
    });
    it("records no type for object<T>(), which only states the value's type", () => {
        expect(declarationOf(bitmap)).toEqual({ transfer: true });
        expect(Reflect.has(declarationOf(bitmap) ?? {}, "type")).toBe(false);
        expect(() => Component.register(bitmap, { type: Component.object<ImageBitmap>(), transfer: true })).not.toThrow();
        expect(() => register(bitmap, { transfer: true })).not.toThrow();
    });
    it("takes traits other packages register, in the namespace components share", () => {
        const early = Symbol("typesComponentTest/early");
        expect(() => register(early, { type: { const: true }, [late]: true })).toThrow(`typesComponentTest/late isn't a registered trait`);
        Trait.register(late);
        expect(() => register(early, { type: { const: true }, [late]: true })).not.toThrow();
        expect(declarationOf(marked)).toEqual({ type: { const: true }, [mark]: true });
        expect(() => Trait.register(mark)).not.toThrow();
        expect(declarationOf(slot)).toEqual({ type: { type: "number", default: 0 }, derived: true });
    });
});
