import { declarationOf } from "../registry/create-registry.js";
import { describe, expect, it } from "vitest";
import { Component } from "../component/component.js";
import { Resource } from "./resource.js";

const testTime = 'resourceSchemasTest/time';
const testShared = 'resourceSchemasTest/shared';
const testSymbol = Symbol('resourceSchemasTest/symbol');

declare module '@adobe/data-ecs' {
    export interface Resources {
        [testTime]: { type: number };
        [testShared]: { type: true };
        [testSymbol]: { type: boolean };
    }
    export interface Components {
        [testShared]: { type: true };
    }
}

describe("Resource.register", () => {
    it("registers the schema", () => {
        Resource.register(testTime, { type: { type: 'number', default: 0 } });
        expect(declarationOf(testTime)).toEqual({ type: { type: 'number', default: 0 } });
    });
    it("registers a symbol name", () => {
        Resource.register(testSymbol, { type: { type: 'boolean', default: false } });
        expect(declarationOf(testSymbol)).toEqual({ type: { type: 'boolean', default: false } });
    });
    it("accepts the same declaration again, and rejects a different one", () => {
        Resource.register(testTime, { type: { type: 'number', default: 0 } });
        expect(() => Resource.register(testTime, { type: { type: 'number', default: 1 } })).toThrow('already declared as a resource');
    });
    it("rejects a name already declared as a component, in types and at registration", () => {
        // @ts-expect-error a name declared as both a component and a resource can't be registered as either
        Component.register(testShared, { type: { const: true } });
        // @ts-expect-error a name declared as both a component and a resource can't be registered as either
        expect(() => Resource.register(testShared, { type: { const: true, default: true } })).toThrow('already declared as a component');
    });
});
