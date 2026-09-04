// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Data } from "@adobe/data";
import type { Observe } from "@adobe/data/observe";
import type { Schema } from "@adobe/data/schema";

/**
 * Argument observes flow the "wrong" way: an `Observe` passed as (or nested
 * inside) a call argument is a stream from the CALLER to the CALLEE. It can't be
 * cloned onto the wire, so the caller replaces each one with a numeric ref and
 * streams its values back on demand; the host reconstructs a local `Observe`
 * from the ref that, when subscribed, pulls from the caller. These pure walkers
 * find the observe positions in an argument value using its parameter schema.
 *
 * Only `observe` positions are transformed (the case the wire supports for
 * arguments); `promise`/`generator`/`function` arguments are not shimmed and
 * would fail to clone — describe arguments with `Data` and `observe` only.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Replace every `observe`-typed position in `value` (guided by `schema`) with a ref. */
export function marshalObserveValue(value: unknown, schema: Schema, onObserve: (obs: Observe<Data>) => number): Data {
    if (schema.type === "observe") {
        // A nullable observe arg may legitimately be absent; only shim a real function.
        return typeof value === "function" ? onObserve(value as Observe<Data>) : (value as Data);
    }
    if ((schema.type === "object" || schema.properties !== undefined) && isPlainObject(value)) {
        const props = schema.properties ?? {};
        const out: Record<string, Data> = { ...(value as Record<string, Data>) };
        for (const [key, childSchema] of Object.entries(props)) {
            if (key in value) out[key] = marshalObserveValue(value[key], childSchema, onObserve);
        }
        return out;
    }
    if ((schema.type === "array" || schema.items !== undefined) && Array.isArray(value) && schema.items !== undefined) {
        const items = schema.items;
        return value.map((v) => marshalObserveValue(v, items, onObserve));
    }
    return value as Data;
}

/** Reconstruct every `observe`-typed position (a ref) in `value` into a local `Observe`. */
export function unmarshalObserveValue(value: unknown, schema: Schema, onRef: (ref: number) => Observe<Data>): unknown {
    if (schema.type === "observe") {
        return typeof value === "number" ? onRef(value) : value;
    }
    if ((schema.type === "object" || schema.properties !== undefined) && isPlainObject(value)) {
        const props = schema.properties ?? {};
        const out: Record<string, unknown> = { ...value };
        for (const [key, childSchema] of Object.entries(props)) {
            if (key in value) out[key] = unmarshalObserveValue(value[key], childSchema, onRef);
        }
        return out;
    }
    if ((schema.type === "array" || schema.items !== undefined) && Array.isArray(value) && schema.items !== undefined) {
        const items = schema.items;
        return value.map((v) => unmarshalObserveValue(v, items, onRef));
    }
    return value;
}

/** Map each argument through the observe marshaller using its parameter schema. */
export function marshalArgsWith(
    args: readonly unknown[],
    params: readonly Schema[] | undefined,
    onObserve: (obs: Observe<Data>) => number,
): Data[] {
    if (params === undefined) return args as Data[];
    return args.map((arg, i) => (params[i] === undefined ? (arg as Data) : marshalObserveValue(arg, params[i], onObserve)));
}

/** Map each argument through the observe unmarshaller using its parameter schema. */
export function unmarshalArgsWith(
    args: readonly Data[],
    params: readonly Schema[] | undefined,
    onRef: (ref: number) => Observe<Data>,
): unknown[] {
    if (params === undefined) return args as unknown[];
    return args.map((arg, i) => (params[i] === undefined ? arg : unmarshalObserveValue(arg, params[i], onRef)));
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
