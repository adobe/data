import { describe, expect, it } from "vitest";
import { Component } from "../component/component.js";
import { declarationOf, kindOf, threadOfDeclaration } from "../registry/index.js";
import { threadClaims, threadPort, threadStatus } from "../components/index.js";
import { always, cadence, clock, gpuDevice, report, wake, workers } from "../resources/index.js";
import { Resource } from "./resource.js";

const time = "typesResourceTest/time";
const symbol = Symbol("typesResourceTest/symbol");
const shared = "typesResourceTest/shared";
const cache = "typesResourceTest/cache";
const port = "typesResourceTest/port";
const total = "typesResourceTest/total";
const flags = "typesResourceTest/flags";

declare module "@adobe/data-ecs" {
    export interface Resources {
        [time]: { type: number };
        [symbol]: { type: boolean };
        [shared]: { type: true };
        [cache]: { type: Map<string, number>; thread: "main" };
        [port]: { type: MessagePort | null; transfer: true };
        [total]: { type: number; reduce: "+" };
        [flags]: { type: boolean; reduce: "|" };
    }
    export interface Components {
        [shared]: { type: true };
    }
}

/** Registers as an untyped caller would, bypassing the types' checks. */
const register = (name: string | symbol, declaration: object): void => Reflect.apply(Resource.register, undefined, [name, declaration]);

describe("Resource.register", () => {
    it("records the declaration, by string or symbol", () => {
        Resource.register(time, { type: { type: "number", default: 0 } });
        Resource.register(symbol, { type: { type: "boolean", default: false } });
        expect(declarationOf(time)).toEqual({ type: { type: "number", default: 0 } });
        expect(declarationOf(symbol)).toEqual({ type: { type: "boolean", default: false } });
        expect(kindOf(symbol)).toBe("resource");
        expect(() => register(Symbol(), { type: { type: "boolean", default: false } })).toThrow("a symbol name needs a description");
        expect(() => register(Symbol("typesResourceTest/symbol"), { type: { type: "boolean", default: false } })).toThrow("already declared as a resource");
    });
    it("accepts the same declaration again, and rejects a different one or one also declared as a component", () => {
        expect(() => Resource.register(time, { type: { type: "number", default: 0 } })).not.toThrow();
        expect(() => Resource.register(time, { type: { type: "number", default: 1 } })).toThrow(`Cannot declare resource "${time}": already declared as a resource.`);
        // @ts-expect-error a name declared as both a component and a resource can't be registered as either
        Component.register(shared, { type: { const: true } });
        // @ts-expect-error a name declared as both a component and a resource can't be registered as either
        expect(() => Resource.register(shared, { type: { const: true, default: true } })).toThrow("already declared as a component");
    });
    it("declares gpuDevice on \"world\", and the loop's state as resources", () => {
        expect(declarationOf(gpuDevice)).toEqual({});
        expect(threadOfDeclaration(declarationOf(gpuDevice) ?? {})).toBe("world");
        // Node has no Worker, so its platform default is no pool.
        expect(declarationOf(workers)).toEqual({ type: { type: "integer", minimum: 0, default: 0 } });
        expect(threadOfDeclaration(declarationOf(workers) ?? {})).toBe(null);
        const defaults = [cadence, always, wake, clock, report].map(name => {
            const type = declarationOf(name)?.type;
            return type !== undefined && "default" in type ? type.default : undefined;
        });
        expect(defaults).toEqual([{ kind: "frame" }, false, Infinity, { now: 0, delta: 0, tick: 0 }, { failures: [], skipped: [], dropped: 0 }]);
        expect(declarationOf(wake)?.reduce).toBe("min");
        expect([cadence, always, wake, clock, report].map(name => threadOfDeclaration(declarationOf(name) ?? {}))).toEqual(["world", null, null, null, "world"]);
    });
    it("declares a joined thread's components", () => {
        expect([threadPort, threadClaims, threadStatus].map(name => declarationOf(name))).toEqual([
            { transfer: true },
            { type: { type: "array", items: { type: "string" } } },
            { type: { anyOf: [{ const: "joining" }, { const: "joined" }, { const: "gone" }] } },
        ]);
    });
    it("checks thread and transfer as far as values tell", () => {
        Resource.register(cache, { default: new Map(), thread: "main" });
        expect(threadOfDeclaration(declarationOf(cache) ?? {})).toBe("main");
        Resource.register(port, { transfer: true });
        expect(() => register("typesResourceTest/buffer", { default: new ArrayBuffer(8), transfer: true })).not.toThrow();
        expect(() => register("typesResourceTest/map", { default: new Map(), transfer: true })).toThrow("its value isn't Transferable");
        expect(() => register("typesResourceTest/count", { type: { type: "number", default: 0 }, thread: "main" })).toThrow("a struct lives in shared memory");
    });
    it("checks reductions", () => {
        Resource.register(total, { type: { type: "number", default: 0 }, reduce: "+" });
        Resource.register(flags, { type: { type: "boolean", default: false }, reduce: "|" });
        expect(() => register("typesResourceTest/badOperator", { type: { type: "number", default: 0 }, reduce: "-" })).toThrow('reduce is one of "+"');
        expect(() => register("typesResourceTest/sumFlags", { type: { type: "boolean", default: false }, reduce: "+" })).toThrow('booleans reduce with "&", "|" or "^"');
        expect(() => register("typesResourceTest/text", { type: { type: "string", default: "" }, reduce: "max" })).toThrow("a reduced resource is a struct");
    });
});
