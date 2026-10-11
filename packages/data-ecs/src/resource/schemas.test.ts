import { describe, expect, it } from "vitest";
import "../components/index.js";
import { Resource } from "./resource.js";

const testTime = 'resourceSchemasTest/time';
const testShared = 'shared';
const testSymbol = Symbol('resourceSchemasTest/symbol');

declare module './types.js' {
    export interface Types {
        [testTime]: number;
        [testShared]: true;
        [testSymbol]: boolean;
    }
}

describe("Resource.register", () => {
    it("registers the schema", () => {
        Resource.register(testTime, { type: 'number', default: 0 });
        expect(Resource.schemas[testTime]).toEqual({ type: 'number', default: 0 });
    });
    it("registers a symbol name", () => {
        Resource.register(testSymbol, { type: 'boolean', default: false });
        expect(Resource.schemas[testSymbol]).toEqual({ type: 'boolean', default: false });
    });
    it("rejects a duplicate name", () => {
        expect(() => Resource.register(testTime, { type: 'number', default: 0 })).toThrow('already declared as a resource');
    });
    it("rejects a name already declared as a component", () => {
        expect(() => Resource.register(testShared, { const: true, default: true })).toThrow('already declared as a component');
    });
});
