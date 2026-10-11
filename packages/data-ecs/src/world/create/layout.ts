import type { Schema } from '../../schema/schema.js';
import { allocateArray } from './arrays.js';
import type { Path } from './kernel.js';
import type { Memory } from './memory.js';

export type TypedArray = Float64Array | Float32Array | Int32Array | Uint32Array | Uint8Array;

export type Scalar = "f32" | "f64" | "i32" | "u32" | "boolean";

export type Leaf = { readonly path: Path; readonly scalar: Scalar };

/**
 * How a component's values are stored.
 * - `constant`: a `const` schema; no storage, every value is `value`.
 * - `linear`: one typed array per scalar leaf, in `leaves` order. `read` copies a value out; `write` replaces it.
 * - `object`: a JS array of values, main thread only.
 */
export type Layout =
    | { readonly kind: "constant"; readonly value: unknown }
    | {
        readonly kind: "linear";
        readonly leaves: readonly Leaf[];
        readonly read: (fields: readonly TypedArray[], row: number) => unknown;
        readonly write: (fields: readonly TypedArray[], row: number, value: unknown) => void;
    }
    | { readonly kind: "object" };

type Node = {
    readonly read: (fields: readonly TypedArray[], row: number) => unknown;
    readonly write: (fields: readonly TypedArray[], row: number, value: unknown) => void;
};

/** A typed array for a scalar leaf over a new arena block. */
export const allocateLeaf = (memory: Memory, scalar: Scalar, length: number): TypedArray => {
    switch (scalar) {
        case "f32": return allocateArray(memory, Float32Array, length);
        case "f64": return allocateArray(memory, Float64Array, length);
        case "i32": return allocateArray(memory, Int32Array, length);
        case "u32": return allocateArray(memory, Uint32Array, length);
        case "boolean": return allocateArray(memory, Uint8Array, length);
    }
};

const integerScalar = (schema: { readonly minimum?: number; readonly maximum?: number }): Scalar => {
    const { minimum, maximum } = schema;
    if (minimum === undefined || maximum === undefined) return "f64";
    if (minimum >= 0 && maximum <= 0xFFFFFFFF) return "u32";
    if (minimum >= -0x80000000 && maximum <= 0x7FFFFFFF) return "i32";
    return "f64";
};

const scalarOf = (schema: Schema): Scalar | null => {
    if (!("type" in schema)) return null;
    switch (schema.type) {
        case "number": return schema.precision === 1 ? "f32" : "f64";
        case "integer": return integerScalar(schema);
        case "boolean": return "boolean";
        default: return null;
    }
};

const element = (value: unknown, key: number | string): unknown =>
    typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

/** Builds the read/write node for a schema, appending its scalar leaves; `null` if it isn't linear. */
const nodeOf = (schema: Schema, path: Path, leaves: Leaf[]): Node | null => {
    const scalar = scalarOf(schema);
    if (scalar !== null) {
        const index = leaves.length;
        leaves.push({ path, scalar });
        return scalar === "boolean"
            ? { read: (fields, row) => fields[index][row] !== 0, write: (fields, row, value) => { fields[index][row] = Number(value); } }
            : { read: (fields, row) => fields[index][row], write: (fields, row, value) => { fields[index][row] = Number(value); } };
    }
    if (!("type" in schema)) return null;
    if (schema.type === "array") {
        const length = schema.minItems;
        if (length === undefined || length !== schema.maxItems) return null;
        const items: Node[] = [];
        for (let i = 0; i < length; i++) {
            const item = nodeOf(schema.items, [...path, i], leaves);
            if (item === null) return null;
            items.push(item);
        }
        return {
            read: (fields, row) => {
                const value = new Array<unknown>(length);
                for (let i = 0; i < length; i++) value[i] = items[i].read(fields, row);
                return value;
            },
            write: (fields, row, value) => {
                for (let i = 0; i < length; i++) items[i].write(fields, row, element(value, i));
            },
        };
    }
    if (schema.type === "object") {
        const names = Object.keys(schema.properties);
        const required = schema.required;
        if (required !== undefined && names.some(name => !required.includes(name))) return null;
        const items: Node[] = [];
        for (const name of names) {
            const item = nodeOf(schema.properties[name], [...path, name], leaves);
            if (item === null) return null;
            items.push(item);
        }
        return {
            read: (fields, row) => {
                const value: { [name: string]: unknown } = {};
                for (let i = 0; i < names.length; i++) value[names[i]] = items[i].read(fields, row);
                return value;
            },
            write: (fields, row, value) => {
                for (let i = 0; i < names.length; i++) items[i].write(fields, row, element(value, names[i]));
            },
        };
    }
    return null;
};

export const layoutOf = (schema: Schema): Layout => {
    if ("const" in schema) return { kind: "constant", value: schema.const };
    const leaves: Leaf[] = [];
    const node = nodeOf(schema, [], leaves);
    return node === null ? { kind: "object" } : { kind: "linear", leaves, read: node.read, write: node.write };
};

export const samePath = (a: Path, b: Path): boolean => a.length === b.length && a.every((key, i) => key === b[i]);
