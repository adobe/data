import { describe, expect, it } from "vitest";
import "../components/index.js";
import { Entity } from "../entity/entity.js";
import { Trait } from "../trait/trait.js";
import { Component } from "./component.js";

const parent = "componentRegisterTest/parent";
const count = "componentRegisterTest/count";
const loose = "componentRegisterTest/loose";
const marked = "componentRegisterTest/marked";
const mark = "componentRegisterTest/mark";

declare module "./types.js" {
    export interface Types {
        [parent]: { type: Entity; reference: "owner" };
        [count]: { type: number };
        [loose]: { type: number };
        [marked]: { type: true; [mark]: true };
    }
}
declare module "../trait/types.js" {
    export interface Types<N> {
        readonly [mark]: true;
    }
}

describe("Component.register", () => {
    it("registers a frozen declaration", () => {
        Component.register(parent, { type: Entity.schema, reference: "owner" });
        const declaration = Component.declaration(parent);
        expect(declaration).toEqual({ type: Entity.schema, reference: "owner" });
        expect(Object.isFrozen(declaration)).toBe(true);
        expect(Component.declaration("persistent")).toEqual({ type: { const: true } });
    });
    it("rejects a duplicate name", () => {
        expect(() => Component.register("persistent", { type: { const: true } })).toThrow("already declared as a component");
    });
    it("rejects traits that aren't registered, and a reference that isn't an entity, for untyped callers", () => {
        // Types can't see registration order, so only the runtime catches a trait used before it's registered.
        expect(() => Component.register(marked, { type: { const: true }, [mark]: true })).toThrow(`${mark} isn't a registered trait`);
        // @ts-expect-error a reference's value is an entity
        expect(() => Component.register(count, { type: { type: "integer" }, reference: "weak" })).toThrow("a reference's type is Entity.schema");
    });
    it("takes traits other packages register, in the namespace components share", () => {
        Trait.register(mark);
        Component.register(marked, { type: { const: true }, [mark]: true });
        expect(Component.declaration(marked)).toEqual({ type: { const: true }, [mark]: true });
        expect(() => Trait.register(mark)).toThrow("already declared as a trait");
        // @ts-expect-error derived names a trait, not a component
        expect(() => Component.register("derived", { type: { const: true } })).toThrow("already declared as a trait");
        Component.register(loose, { type: { type: "number" } });
    });
});
