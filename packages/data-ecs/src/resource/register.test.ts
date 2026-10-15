import { declarationOf } from "../registry/create-registry.js";
import { describe, expect, it } from "vitest";
import { Component } from "../component/component.js";
import { Resource } from "./resource.js";

const testTime = 'resourceSchemasTest/time';
const testShared = 'resourceSchemasTest/shared';
const testSymbol = Symbol('resourceSchemasTest/symbol');
const testCache = 'resourceSchemasTest/cache';
const testHandle = 'resourceSchemasTest/handle';
const testCount = 'resourceSchemasTest/count';
const testIndex = 'resourceSchemasTest/index';
const testBadIndex = 'resourceSchemasTest/badIndex';

declare module '@adobe/data-ecs' {
    export interface Resources {
        [testTime]: { type: number };
        [testShared]: { type: true };
        [testSymbol]: { type: boolean };
        [testCache]: { type: Map<string, number> | null };
        [testHandle]: { type: Map<string, number> };
        [testCount]: { type: number | null };
    }
    export interface Components {
        [testShared]: { type: true };
        [testIndex]: { type: Map<string, number> };
        [testBadIndex]: { type: Map<string, number> };
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
    it("takes a type that isn't data without a schema, starting at null when its type allows it", () => {
        Resource.register(testCache, {});
        const map = new Map<string, number>();
        Resource.register(testHandle, { default: map });
        expect(declarationOf(testHandle)).toEqual({ default: map });
        // A nullable data type leaves its default out too.
        Resource.register(testCount, { type: { anyOf: [{ type: "number" }, { type: "null" }] } });
    });
    it("rejects a schema for a type that isn't data, and a missing default where null isn't allowed", () => {
        // @ts-expect-error a type that isn't data has no schema
        Component.register(testBadIndex, { type: { type: "object", properties: {} } });
        // @ts-expect-error the type doesn't allow null, so the default is required
        expect(() => Resource.register(testHandle, {})).toThrow("already declared as a resource");
        Component.register(testIndex, {});
    });
});
