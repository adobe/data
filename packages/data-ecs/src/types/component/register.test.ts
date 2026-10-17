import { describe, expect, it } from "vitest";
import { Entity } from "../entity/entity.js";
import { declarationOf, kindOf, threadOfDeclaration } from "../registry/index.js";
import { Trait } from "../trait/trait.js";
import { Component } from "./component.js";

const parent = "typesComponentTest/parent";
const count = "typesComponentTest/count";
const label = "typesComponentTest/label";
const placed = "typesComponentTest/placed";
const position = "typesComponentTest/position";
const bitmap = "typesComponentTest/bitmap";
const marked = "typesComponentTest/marked";
const mark = "typesComponentTest/mark";
const slot = "typesComponentTest/slot";

declare module "@adobe/data-ecs" {
    export interface Threads {
        typesComponentTest: true;
    }
    export interface Components {
        [parent]: { type: Entity; reference: "owner" };
        [count]: { type: number };
        [label]: { type: string };
        [placed]: { type: string; thread: "typesComponentTest" };
        [position]: { type: readonly [number, number] };
        [bitmap]: { type: ImageBitmap; transfer: true };
        [marked]: { type: true; [mark]: true };
        [slot]: { type: number; derived: true };
    }
    export interface Traits<N> {
        readonly [mark]: true;
    }
}

/** Registers as an untyped caller would, bypassing the types' checks. */
const register = (name: string | symbol, declaration: object): void => Reflect.apply(Component.register, undefined, [name, declaration]);

describe("Component.register", () => {
    it("records the declaration, and its thread: none for a struct, else its own or \"world\"", () => {
        Component.register(parent, { type: Entity.schema, reference: "owner" });
        Component.register(label, { type: { type: "string" } });
        Component.register(placed, { type: { type: "string" }, thread: "typesComponentTest" });
        Component.register(position, { type: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 } });
        expect(declarationOf(parent)).toEqual({ type: Entity.schema, reference: "owner" });
        expect(kindOf(parent)).toBe("component");
        expect(threadOfDeclaration({ type: Entity.schema })).toBe(null);
        expect(threadOfDeclaration({ type: { const: true } })).toBe(null);
        expect(threadOfDeclaration({ type: { type: "object", properties: { at: { type: "number" } } } })).toBe(null);
        expect(threadOfDeclaration({ type: { type: "array", items: { type: "number" } } })).toBe("world");
        expect(threadOfDeclaration({ type: { type: "object", properties: { at: { type: "number" } }, required: [] } })).toBe("world");
        expect([parent, label, placed, position].map(name => threadOfDeclaration(declarationOf(name) ?? {}))).toEqual([null, "world", "typesComponentTest", null]);
    });
    it("accepts the same declaration again, as a module evaluated again makes it, and rejects a different one or a name of another kind", () => {
        Component.register(count, { type: { type: "number" } });
        expect(() => Component.register(count, { type: { type: "number" } })).not.toThrow();
        expect(() => register(count, { type: { type: "integer" } })).toThrow(`Cannot declare component "${count}": already declared as a component.`);
        expect(declarationOf(count)).toEqual({ type: { type: "number" } });
        // @ts-expect-error derived names a trait, not a component
        expect(() => Component.register("derived", { type: { const: true } })).toThrow("already declared as a trait");
        expect(kindOf(count)).toBe("component");
    });
    it("rejects what types reject, for untyped callers, recording nothing", () => {
        expect(() => register("typesComponentTest/strayTrait", { type: { type: "number" }, unknown: true })).toThrow("unknown isn't a registered trait");
        expect(() => register("typesComponentTest/badReference", { type: { type: "number" }, reference: "weak" })).toThrow("a reference's type is Entity.schema");
        expect(() => register("typesComponentTest/badSlot", { type: { type: "number" }, derived: true })).toThrow("a derived component's type has a default");
        expect(() => register("typesComponentTest/reduced", { type: { type: "number" }, reduce: "+" })).toThrow("only a resource is reduced");
        expect(declarationOf("typesComponentTest/badReference")).toBe(undefined);
        expect(kindOf("typesComponentTest/badReference")).toBe(undefined);
    });
    it("rejects a schema whose GPU layout can't hold it", () => {
        expect(() => register("typesComponentTest/storageText", { type: { type: "array", items: { type: "string" }, layout: "storage" } })).toThrow("layout needs numbers");
    });
    it("checks thread and transfer as far as values tell", () => {
        expect(() => register("typesComponentTest/placedStruct", { type: { type: "number" }, thread: "main" })).toThrow("a struct lives in shared memory, so it has no thread");
        expect(() => register("typesComponentTest/placedTag", { type: { const: true }, thread: "main" })).toThrow("a struct lives in shared memory");
        expect(() => register("typesComponentTest/emptyThread", { thread: "" })).toThrow("thread is a thread's name");
        expect(() => register("typesComponentTest/dataTransfer", { type: { type: "string" }, transfer: true })).toThrow("a value with a schema is data, which isn't Transferable");
        expect(() => register("typesComponentTest/falseTransfer", { transfer: false })).toThrow("transfer is true");
        Component.register(bitmap, { transfer: true });
        expect(declarationOf(bitmap)).toEqual({ transfer: true });
    });
    it("takes traits other packages register, in the namespace components share", () => {
        expect(() => register(marked, { type: { const: true }, [mark]: true })).toThrow(`${mark} isn't a registered trait`);
        Trait.register(mark);
        Component.register(marked, { type: { const: true }, [mark]: true });
        expect(() => Trait.register(mark)).not.toThrow();
        Component.register(slot, { type: { type: "number", default: 0 }, derived: true });
        expect(declarationOf(slot)).toEqual({ type: { type: "number", default: 0 }, derived: true });
    });
});
