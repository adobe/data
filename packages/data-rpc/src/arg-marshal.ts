// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Data } from "@adobe/data";
import type { Observe } from "@adobe/data/observe";
import type { Schema } from "@adobe/data/schema";

/**
 * Constructor-typed values (`Observe`/`Promise`/`AsyncGenerator`) passed as — or
 * nested inside — a call argument flow the "wrong" way: from the CALLER to the
 * CALLEE. They can't be cloned onto the wire, so the caller replaces each with a
 * numeric ref and services it over a reverse channel; the callee reconstructs a
 * local value from the ref. These pure walkers find the constructor positions in
 * an argument using its parameter schema and delegate to the caller's handlers.
 *
 * Only `Data` ever crosses; the constructor's payload values are themselves
 * `Data`. Function (callback) arguments are not supported.
 */

export interface MarshalHandlers {
    readonly observe: (obs: Observe<Data>) => number;
    readonly promise: (promise: Promise<Data>) => number;
    readonly generator: (generator: AsyncGenerator<Data>) => number;
}

export interface UnmarshalHandlers {
    readonly observe: (ref: number) => Observe<Data>;
    readonly promise: (ref: number) => Promise<Data>;
    readonly generator: (ref: number) => AsyncGenerator<Data>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isThenable(value: unknown): value is Promise<Data> {
    return (typeof value === "object" || typeof value === "function") && value !== null && typeof (value as { then?: unknown }).then === "function";
}

function isAsyncIterable(value: unknown): value is AsyncGenerator<Data> {
    return value !== null && typeof value === "object" && typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function";
}

/** Replace every constructor-typed position in `value` (guided by `schema`) with a ref. */
export function marshalArgValue(value: unknown, schema: Schema, h: MarshalHandlers): Data {
    if (schema.type === "observe") return typeof value === "function" ? h.observe(value as Observe<Data>) : (value as Data);
    if (schema.type === "promise") return isThenable(value) ? h.promise(value) : (value as Data);
    if (schema.type === "generator") return isAsyncIterable(value) ? h.generator(value) : (value as Data);
    if ((schema.type === "object" || schema.properties !== undefined) && isPlainObject(value)) {
        const props = schema.properties ?? {};
        const out: Record<string, Data> = { ...(value as Record<string, Data>) };
        for (const [key, childSchema] of Object.entries(props)) {
            if (key in value) out[key] = marshalArgValue(value[key], childSchema, h);
        }
        return out;
    }
    if ((schema.type === "array" || schema.items !== undefined) && Array.isArray(value) && schema.items !== undefined) {
        const items = schema.items;
        return value.map((v) => marshalArgValue(v, items, h));
    }
    return value as Data;
}

/** Reconstruct every constructor-typed position (a ref) in `value` into a local value. */
export function unmarshalArgValue(value: unknown, schema: Schema, h: UnmarshalHandlers): unknown {
    if (schema.type === "observe") return typeof value === "number" ? h.observe(value) : value;
    if (schema.type === "promise") return typeof value === "number" ? h.promise(value) : value;
    if (schema.type === "generator") return typeof value === "number" ? h.generator(value) : value;
    if ((schema.type === "object" || schema.properties !== undefined) && isPlainObject(value)) {
        const props = schema.properties ?? {};
        const out: Record<string, unknown> = { ...value };
        for (const [key, childSchema] of Object.entries(props)) {
            if (key in value) out[key] = unmarshalArgValue(value[key], childSchema, h);
        }
        return out;
    }
    if ((schema.type === "array" || schema.items !== undefined) && Array.isArray(value) && schema.items !== undefined) {
        const items = schema.items;
        return value.map((v) => unmarshalArgValue(v, items, h));
    }
    return value;
}

/** Map each argument through the marshaller using its parameter schema. */
export function marshalArgsWith(args: readonly unknown[], params: readonly Schema[] | undefined, h: MarshalHandlers): Data[] {
    if (params === undefined) return args as Data[];
    return args.map((arg, i) => (params[i] === undefined ? (arg as Data) : marshalArgValue(arg, params[i], h)));
}

/** Map each argument through the unmarshaller using its parameter schema. */
export function unmarshalArgsWith(args: readonly Data[], params: readonly Schema[] | undefined, h: UnmarshalHandlers): unknown[] {
    if (params === undefined) return args as unknown[];
    return args.map((arg, i) => (params[i] === undefined ? arg : unmarshalArgValue(arg, params[i], h)));
}

/** True if the schema tree contains no type-constructor (observe/promise/generator/function). */
export function isPureDataSchema(schema: Schema): boolean {
    if (schema.type === "observe" || schema.type === "promise" || schema.type === "generator" || schema.type === "function") {
        return false;
    }
    if (schema.properties !== undefined) {
        for (const child of Object.values(schema.properties)) {
            if (!isPureDataSchema(child)) return false;
        }
    }
    if (schema.items !== undefined && !isPureDataSchema(schema.items)) return false;
    return true;
}
