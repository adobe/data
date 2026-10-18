import { describe, expect, it } from "vitest";
import { Component } from "../component/component.js";
import { declarationOf, kindOf, threadOfDeclaration } from "../registry/index.js";
import { always, cadence, clock, gpuDevice, report, wake, workers } from "../resources/index.js";
import { Resource } from "./resource.js";

const time = Symbol("typesResourceTest/time");
const symbol = Symbol("typesResourceTest/symbol");
const shared = Symbol("typesResourceTest/shared");
const cache = Symbol("typesResourceTest/cache");
const port = Symbol("typesResourceTest/port");
const total = Symbol("typesResourceTest/total");
const flags = Symbol("typesResourceTest/flags");

declare module "@adobe/data-ecs" {
    export interface Resources {
        [time]: typeof timeTraits;
        [symbol]: typeof symbolTraits;
        [shared]: typeof sharedTraits;
        [cache]: typeof cacheTraits;
        [port]: typeof portTraits;
        [total]: typeof totalTraits;
        [flags]: typeof flagsTraits;
    }
    export interface Components {
        [shared]: typeof sharedTraits;
    }
}

const timeTraits = Resource.register(time, { type: { type: "number", default: 0 } });
const symbolTraits = Resource.register(symbol, { type: { type: "boolean", default: false } });
// @ts-expect-error a key declared as both a component and a resource can't be registered as either
const sharedTraits = Component.register(shared, { type: { const: true } });
const cacheTraits = Resource.register(cache, { type: Resource.object<Map<string, number>>(), default: new Map(), thread: "main" });
const portTraits = Resource.register(port, { type: Resource.object<MessagePort | null>(), transfer: true });
const totalTraits = Resource.register(total, { type: { type: "number", default: 0 }, reduce: "+" });
const flagsTraits = Resource.register(flags, { type: { type: "boolean", default: false }, reduce: "|" });

const untyped: (...parameters: never[]) => unknown = Resource.register;

/** Registers as an untyped caller would, bypassing the types' checks. */
const register = (key: unknown, declaration: object): void => {
    Reflect.apply(untyped, undefined, [key, declaration]);
};

describe("Resource.register", () => {
    it("records the declaration by its symbol, which needs no description", () => {
        expect(declarationOf(time)).toEqual({ type: { type: "number", default: 0 } });
        expect(declarationOf(symbol)).toEqual({ type: { type: "boolean", default: false } });
        expect(kindOf(symbol)).toBe("resource");
        const anonymous = Symbol();
        register(anonymous, { type: { type: "boolean", default: false } });
        expect(kindOf(anonymous)).toBe("resource");
        // Another symbol with the same description is another key.
        expect(() => register(Symbol("typesResourceTest/symbol"), { type: { type: "number", default: 0 } })).not.toThrow();
        expect(() => register("typesResourceTest/text", { type: { type: "number", default: 0 } })).toThrow("a key is a plain Symbol(...), not a string.");
    });
    it("accepts the same declaration again, and rejects a different one or one also declared as a component", () => {
        expect(() => Resource.register(time, { type: { type: "number", default: 0 } })).not.toThrow();
        expect(() => Resource.register(time, { type: { type: "number", default: 1 } })).toThrow(`Cannot register resource "typesResourceTest/time": already registered as a resource, with another declaration.`);
        // @ts-expect-error a key declared as both a component and a resource can't be registered as either
        expect(() => Resource.register(shared, { type: { const: true, default: true } })).toThrow("already registered as a component");
    });
    it("declares gpuDevice on \"world\", and the loop's state as resources", () => {
        expect(declarationOf(gpuDevice)).toEqual({});
        expect(threadOfDeclaration(declarationOf(gpuDevice) ?? {})).toBe("world");
        expect(declarationOf(workers)).toEqual({ type: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }], default: null } });
        // null isn't a struct, so workers is an object resource on "world".
        expect(threadOfDeclaration(declarationOf(workers) ?? {})).toBe("world");
        const defaults = [cadence, always, wake, clock, report].map(name => {
            const type = declarationOf(name)?.type;
            return type !== undefined && "default" in type ? type.default : undefined;
        });
        expect(defaults).toEqual([{ kind: "frame" }, false, Infinity, { now: 0, delta: 0, tick: 0 }, { failures: [], skipped: [], dropped: 0, warnings: [] }]);
        expect(declarationOf(wake)?.reduce).toBe("min");
        expect([cadence, always, wake, clock, report].map(name => threadOfDeclaration(declarationOf(name) ?? {}))).toEqual(["world", null, null, null, "world"]);
    });
    it("checks thread and transfer as far as values tell", () => {
        expect(declarationOf(cache)).toEqual({ default: new Map(), thread: "main" });
        expect(threadOfDeclaration(declarationOf(cache) ?? {})).toBe("main");
        expect(declarationOf(port)).toEqual({ transfer: true });
        expect(() => register(Symbol("typesResourceTest/buffer"), { default: new ArrayBuffer(8), transfer: true })).not.toThrow();
        expect(() => register(Symbol("typesResourceTest/map"), { default: new Map(), transfer: true })).toThrow("its value isn't Transferable");
        expect(() => register(Symbol("typesResourceTest/count"), { type: { type: "number", default: 0 }, thread: "main" })).toThrow("a struct lives in shared memory");
    });
    it("checks reductions", () => {
        expect(() => register(Symbol("typesResourceTest/badOperator"), { type: { type: "number", default: 0 }, reduce: "-" })).toThrow('reduce is one of "+"');
        expect(() => register(Symbol("typesResourceTest/sumFlags"), { type: { type: "boolean", default: false }, reduce: "+" })).toThrow('booleans reduce with "&", "|" or "^"');
        expect(() => register(Symbol("typesResourceTest/text"), { type: { type: "string", default: "" }, reduce: "max" })).toThrow("a reduced resource is a struct");
    });
});
