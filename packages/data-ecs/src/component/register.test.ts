import { declarationOf } from "../registry/create-registry.js";
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

declare module "@adobe/data-ecs" {
    export interface Components {
        [parent]: { type: Entity; reference: "owner" };
        [count]: { type: number };
        [loose]: { type: number };
        [marked]: { type: true; [mark]: true };
    }
    export interface Traits<N> {
        readonly [mark]: true;
    }
}

describe("Component.register", () => {
    it("registers the declaration", () => {
        Component.register(parent, { type: Entity.schema, reference: "owner" });
        const declaration = declarationOf(parent);
        expect(declaration).toEqual({ type: Entity.schema, reference: "owner" });
        expect(declarationOf("persistent")).toEqual({ type: { const: true } });
    });
    it("accepts the same declaration again, as a module evaluated again makes it, and rejects a different one", () => {
        Component.register("persistent", { type: { const: true } });
        // @ts-expect-error the declaration differs from the declared type
        expect(() => Component.register("persistent", { type: { type: "boolean" } })).toThrow("already declared as a component");
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
        expect(declarationOf(marked)).toEqual({ type: { const: true }, [mark]: true });
        Trait.register(mark);
        // @ts-expect-error derived names a trait, not a component
        expect(() => Component.register("derived", { type: { const: true } })).toThrow("already declared as a trait");
        Component.register(loose, { type: { type: "number" } });
    });
});
