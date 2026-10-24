// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Entity } from "../entity/entity.js";
import { registerComponent } from "../registry/declarations.js";
import { addTrait } from "../registry/traits.js";
import { declarationOf, kindOf, threadOfDeclaration } from "../registry/index.js";

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

declare module "@adobe/ecs" {
    export interface Threads {
        typesComponentTest: true;
    }
    export interface Components {
        [parent]: { type: Entity; reference: "owner" };
        [count]: { type: number };
        [label]: { type: string };
        [placed]: { type: readonly string[]; thread: "typesComponentTest" };
        [position]: { type: readonly [number, number] };
        [bitmap]: { type: ImageBitmap; transfer: true };
        [marked]: { type: true; [mark]: true };
        [slot]: { type: number; derived: true; default: 0 };
    }
    export interface Traits<N> {
        readonly [mark]: true;
    }
}

/** Registers a declaration as the build does, which a test may write wrong. */
const register = (key: unknown, declaration: object): void => registerComponent(key, declaration);

describe("registering a component", () => {
    it("records the declaration, and its thread: none for a struct or a string, else its own or \"world\"", () => {
        expect(declarationOf(parent)).toEqual({ type: Entity.schema, reference: "owner" });
        expect(kindOf(parent)).toBe("component");
        expect(threadOfDeclaration({ type: Entity.schema })).toBe(null);
        expect(threadOfDeclaration({ type: { const: true } })).toBe(null);
        expect(threadOfDeclaration({ type: { type: "object", properties: { at: { type: "number" } } } })).toBe(null);
        expect(threadOfDeclaration({ type: { type: "array", items: { type: "number" } } })).toBe("world");
        expect(threadOfDeclaration({ type: { type: "object", properties: { at: { type: "number" } }, required: [] } })).toBe("world");
        expect([parent, label, placed, position].map(name => threadOfDeclaration(declarationOf(name) ?? {}))).toEqual([null, null, "typesComponentTest", null]);
        expect(threadOfDeclaration({ type: { anyOf: [{ const: "edit" }, { const: "view" }] } })).toBe(null);
        expect(threadOfDeclaration({ type: { anyOf: [{ type: "string" }, { type: "null" }] } })).toBe(null);
        expect(threadOfDeclaration({ type: { anyOf: [{ type: "string" }, { type: "number" }] } })).toBe("world");
    });
    it("accepts the same declaration again, as a module evaluated again makes it, and rejects a different one or a key of another kind", () => {
        expect(() => register(count, { type: { type: "number" } })).not.toThrow();
        expect(() => register(count, { type: { type: "integer" } })).toThrow(`Cannot register component "typesComponentTest/count": already registered as a component, with another declaration.`);
        expect(declarationOf(count)).toEqual({ type: { type: "number" } });
        const claimed = Symbol("typesComponentTest/claimed");
        register(claimed, { type: { const: true } });
        expect(() => addTrait(claimed)).toThrow(`Cannot register trait "typesComponentTest/claimed": already registered as a component.`);
        expect(kindOf(count)).toBe("component");
    });
    it("takes only plain symbols as keys, so built-in traits' string names are no component's", () => {
        expect(() => register("derived", { type: { const: true } })).toThrow(`Cannot register component "derived": a key is a plain Symbol(...), not a string.`);
        expect(() => register(Symbol.for("shared"), { type: { const: true } })).toThrow("a Symbol.for key is shared across the program");
        expect(() => register(Symbol.asyncIterator, { type: { const: true } })).toThrow("Symbol.asyncIterator is a well-known symbol.");
        expect(kindOf("derived")).toBe(undefined);
    });
    it("rejects a declaration whose traits can't hold, recording nothing", () => {
        expect(() => register(Symbol("typesComponentTest/strayTrait"), { type: { type: "number" }, unknown: true })).toThrow("unknown isn't a registered trait");
        expect(() => register(Symbol("typesComponentTest/badReference"), { type: { type: "number" }, reference: "weak" })).toThrow("a reference's type is Entity.schema");
        expect(() => register(Symbol("typesComponentTest/badSlot"), { type: { type: "number" }, derived: true })).toThrow("a derived component's type has a default");
        expect(() => register(Symbol("typesComponentTest/reduced"), { type: { type: "number" }, reduce: "+" })).toThrow("only a resource is reduced");
        expect(() => register(Symbol("typesComponentTest/derivedWithin"), { type: { type: "number", default: 0 }, derived: true, within: count })).toThrow("a derived component's rule covers within");
        expect(() => register(Symbol("typesComponentTest/derivedReference"), { type: { ...Entity.schema, default: Entity.none }, derived: true, reference: "owner" })).toThrow("a rule can't set a derived component's target");
        const badReference = Symbol("typesComponentTest/badReference");
        expect(() => register(badReference, { type: { type: "number" }, reference: "weak" })).toThrow("a reference's type is Entity.schema");
        expect(declarationOf(badReference)).toBe(undefined);
        expect(kindOf(badReference)).toBe(undefined);
    });
    it("rejects a default that isn't one of its type's values, however it's given", () => {
        expect(() => register(Symbol("typesComponentTest/tallHeight"), { type: { type: "number", precision: 1, default: "tall" } })).toThrow("its default, tall, isn't one of its type's values");
        expect(() => register(Symbol("typesComponentTest/lowLevel"), { type: { type: "integer", minimum: 1, maximum: 9, default: 0 }, derived: true })).toThrow("isn't one of its type's values");
        expect(() => register(Symbol("typesComponentTest/floor"), { type: { type: "number", precision: 1, default: -Infinity } })).not.toThrow();
    });
    it("rejects a schema whose GPU layout can't hold it", () => {
        expect(() => register(Symbol("typesComponentTest/storageText"), { type: { type: "array", items: { type: "string" }, layout: "storage" } })).toThrow("layout needs numbers");
    });
    it("checks thread and transfer as far as values tell", () => {
        expect(() => register(Symbol("typesComponentTest/placedStruct"), { type: { type: "number" }, thread: "main" })).toThrow("a struct lives in shared memory, so it has no thread");
        expect(() => register(Symbol("typesComponentTest/placedTag"), { type: { const: true }, thread: "main" })).toThrow("a struct lives in shared memory");
        expect(() => register(Symbol("typesComponentTest/placedText"), { type: { type: "string" }, thread: "main" })).toThrow("a string lives in shared memory, so it has no thread");
        expect(() => register(Symbol("typesComponentTest/placedMode"), { type: { anyOf: [{ const: "edit" }, { const: "view" }] }, thread: "main" })).toThrow("a string lives in shared memory");
        expect(() => register(Symbol("typesComponentTest/emptyThread"), { thread: "" })).toThrow("thread is a thread's name");
        expect(() => register(Symbol("typesComponentTest/dataTransfer"), { type: { type: "string" }, transfer: true })).toThrow("a value with a schema is data, which isn't Transferable");
        expect(() => register(Symbol("typesComponentTest/falseTransfer"), { transfer: false })).toThrow("transfer is true");
    });
    it("records no type for a value that isn't data", () => {
        expect(declarationOf(bitmap)).toEqual({ transfer: true });
        expect(Reflect.has(declarationOf(bitmap) ?? {}, "type")).toBe(false);
        expect(() => register(bitmap, { transfer: true })).not.toThrow();
    });
    it("rejects a default beside a component's schema, which holds it", () => {
        expect(() => register(Symbol("typesComponentTest/defaulted"), { type: { type: "number" }, default: 0 })).toThrow("its schema holds its default");
    });
    it("takes traits other packages register, in the namespace components share", () => {
        const early = Symbol("typesComponentTest/early");
        expect(() => register(early, { type: { const: true }, [late]: true })).toThrow(`typesComponentTest/late isn't a registered trait`);
        addTrait(late);
        expect(() => register(early, { type: { const: true }, [late]: true })).not.toThrow();
        expect(declarationOf(marked)).toEqual({ type: { const: true }, [mark]: true });
        expect(() => addTrait(mark)).not.toThrow();
        expect(declarationOf(slot)).toEqual({ type: { type: "number", default: 0 }, derived: true });
    });
});
