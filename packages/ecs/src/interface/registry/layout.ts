// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Schema } from '../schema/schema.js';
import { isString } from './schemas.js';

/** A path from a value to one scalar leaf: `[]` for a scalar, `[1]` for a tuple element, `["x"]` for a struct field. */
export type Path = readonly (number | string)[];

/** A leaf's logical type. */
export type Scalar = "f32" | "f64" | "i32" | "u32" | "boolean";

/** The typed array a leaf is stored through: booleans are `u8` on the CPU and `u32` in GPU layouts. */
export type View = "f32" | "f64" | "i32" | "u32" | "u8";

/** Views of one component's bytes; a leaf reads the one its `view` names. */
export type Views = {
    readonly f32: Float32Array;
    readonly f64: Float64Array;
    readonly i32: Int32Array;
    readonly u32: Uint32Array;
    readonly u8: Uint8Array;
};

export type TypedArray = Views[keyof Views];

/** A scalar leaf at byte `offset` within each element. In elements of its view, a row's value is at `row * unitStride + unitOffset`. */
export type Leaf = {
    readonly path: Path;
    readonly scalar: Scalar;
    readonly view: View;
    readonly offset: number;
    readonly unitStride: number;
    readonly unitOffset: number;
};

/**
 * How a component's values are stored.
 * - `constant`: a `const` schema; no storage, every value is `value`.
 * - `linear`: interleaved elements of `stride` bytes in one column. `read` copies a value out; `write` replaces it.
 * - `string`: the world's thread's values, as `object`'s, and a 4-byte handle per row, in one column, to each one's
 *   record in shared memory, which other threads read; only the world's thread writes them.
 * - `object`: a JS array of values, on its logical thread only.
 */
export type Layout =
    | { readonly kind: "constant"; readonly value: unknown }
    | {
        readonly kind: "linear";
        readonly leaves: readonly Leaf[];
        readonly stride: number;
        readonly read: (views: Views, row: number) => unknown;
        readonly write: (views: Views, row: number, value: unknown) => void;
    }
    | { readonly kind: "string"; readonly stride: 4 }
    | { readonly kind: "object" };

/** The layout of every string. */
const stringLayout: Layout = { kind: "string", stride: 4 };

/** The layout of values stored as they are. */
export const objectLayout: Layout = { kind: "object" };

export const bytesOf = (view: View): number => view === "f64" ? 8 : view === "u8" ? 1 : 4;

export const viewsOf = (buffer: ArrayBufferLike, byteOffset: number, byteLength: number): Views => ({
    f32: new Float32Array(buffer, byteOffset, byteLength >> 2),
    f64: new Float64Array(buffer, byteOffset, Math.floor(byteLength / 8)),
    i32: new Int32Array(buffer, byteOffset, byteLength >> 2),
    u32: new Uint32Array(buffer, byteOffset, byteLength >> 2),
    u8: new Uint8Array(buffer, byteOffset, byteLength),
});

/** A value's shape, before placement. */
type Shape =
    | { readonly kind: "scalar"; readonly scalar: Scalar }
    | { readonly kind: "tuple"; readonly items: readonly Shape[] }
    | { readonly kind: "struct"; readonly names: readonly string[]; readonly items: readonly Shape[] };

const integerScalar = ({ minimum, maximum }: { readonly minimum?: number; readonly maximum?: number }): Scalar => {
    if (minimum === undefined || maximum === undefined) return "f64";
    if (minimum >= 0 && maximum <= 0xFFFFFFFF) return "u32";
    if (minimum >= -0x80000000 && maximum <= 0x7FFFFFFF) return "i32";
    return "f64";
};

/** `null` if the schema isn't linear: numbers, booleans, fixed-length tuples and structs of those. */
const shapeOf = (schema: Schema): Shape | null => {
    if (!("type" in schema)) return null;
    switch (schema.type) {
        case "number": return { kind: "scalar", scalar: schema.precision === 1 ? "f32" : "f64" };
        case "integer": return { kind: "scalar", scalar: "format" in schema ? "f64" : integerScalar(schema) };
        case "boolean": return { kind: "scalar", scalar: "boolean" };
        case "array": {
            const length = schema.minItems;
            if (length === undefined || length !== schema.maxItems) return null;
            const item = shapeOf(schema.items);
            return item === null ? null : { kind: "tuple", items: new Array<Shape>(length).fill(item) };
        }
        case "object": {
            const names = Object.keys(schema.properties);
            const { required } = schema;
            if (required !== undefined && names.some(name => !required.includes(name))) return null;
            const items: Shape[] = [];
            for (const name of names) {
                const item = shapeOf(schema.properties[name]);
                if (item === null) return null;
                items.push(item);
            }
            return { kind: "struct", names, items };
        }
        default: return null;
    }
};

const roundUp = (value: number, alignment: number): number => Math.ceil(value / alignment) * alignment;

/** A shape's placement: leaves at offsets relative to the shape's start. */
type Placed = { readonly size: number; readonly align: number; readonly leaves: readonly { readonly path: Path; readonly scalar: Scalar; readonly view: View; readonly offset: number }[] };

type Rules = "cpu" | "storage" | "vertex";

const describe = (path: Path): string => path.length === 0 ? "the value" : `[${path.map(key => JSON.stringify(key)).join("][")}]`;

const gpuScalar = (scalar: Scalar, path: Path): View => {
    if (scalar === "f64") throw new Error(`${describe(path)} is f64, which isn't GPU compatible: use a number with precision: 1, or an integer with minimum and maximum within i32 or u32.`);
    return scalar === "boolean" ? "u32" : scalar;
};

const sameScalar = (items: readonly Shape[]): Scalar | null => {
    const first = items[0];
    if (first?.kind !== "scalar") return null;
    return items.every(item => item.kind === "scalar" && item.scalar === first.scalar) ? first.scalar : null;
};

const place = (shape: Shape, path: Path, rules: Rules): Placed => {
    if (shape.kind === "scalar") {
        const view: View = rules === "cpu" ? (shape.scalar === "boolean" ? "u8" : shape.scalar) : gpuScalar(shape.scalar, path);
        const size = bytesOf(view);
        return { size, align: size, leaves: [{ path, scalar: shape.scalar, view, offset: 0 }] };
    }
    const keys: readonly (number | string)[] = shape.kind === "struct" ? shape.names : shape.items.map((_, i) => i);
    const items = shape.items.map((item, i) => place(item, [...path, keys[i]], rules));
    if (rules === "storage" && shape.kind === "tuple") {
        const scalar = sameScalar(shape.items);
        const length = shape.items.length;
        // WGSL vec2/vec3/vec4: 4-byte components, aligned to 8, 16, 16; a vec3 is 12 bytes, so a scalar can follow it.
        if (scalar !== null && length >= 2 && length <= 4) {
            return { size: 4 * length, align: length === 2 ? 8 : 16, leaves: items.map((item, i) => ({ ...item.leaves[0], offset: 4 * i })) };
        }
        if (!shape.items.every(item => JSON.stringify(item) === JSON.stringify(shape.items[0]))) {
            throw new Error(`${describe(path)} mixes element types, which a WGSL array can't: use a struct.`);
        }
        // WGSL array<T, N>: elements at a stride of T's size rounded up to its alignment.
        const element = items[0];
        const stride = roundUp(element.size, element.align);
        return {
            size: stride * length,
            align: element.align,
            leaves: items.flatMap((item, i) => item.leaves.map(leaf => ({ ...leaf, offset: leaf.offset + i * stride }))),
        };
    }
    const align = rules === "vertex" ? 4 : Math.max(...items.map(item => item.align));
    return pack(items, align, rules === "vertex" ? 4 : 0);
};

/** Members in order, each at its alignment (or `memberAlign` when set), padded to the aggregate's alignment. */
const pack = (items: readonly Placed[], align: number, memberAlign: number): Placed => {
    let offset = 0;
    const leaves: Placed["leaves"][number][] = [];
    for (const item of items) {
        offset = roundUp(offset, memberAlign === 0 ? item.align : Math.min(memberAlign, item.align));
        for (const leaf of item.leaves) leaves.push({ ...leaf, offset: offset + leaf.offset });
        offset += item.size;
    }
    return { size: roundUp(offset, align), align, leaves };
};

type Node = {
    readonly read: (views: Views, row: number) => unknown;
    readonly write: (views: Views, row: number, value: unknown) => void;
};

const element = (value: unknown, key: number | string): unknown =>
    typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

/** A tuple of 2 to 4 same-typed scalars in consecutive elements of one view. */
const lanesNode = (view: View, unitStride: number, unitOffset: number, length: number): Node => {
    const write = (views: Views, row: number, value: unknown): void => {
        const target = views[view];
        const index = row * unitStride + unitOffset;
        if (Array.isArray(value)) for (let i = 0; i < length; i++) target[index + i] = Number(value[i]);
        else for (let i = 0; i < length; i++) target[index + i] = Number(element(value, i));
    };
    if (length === 2) return {
        read: (views, row) => {
            const target = views[view];
            const index = row * unitStride + unitOffset;
            return [target[index], target[index + 1]];
        },
        write,
    };
    if (length === 3) return {
        read: (views, row) => {
            const target = views[view];
            const index = row * unitStride + unitOffset;
            return [target[index], target[index + 1], target[index + 2]];
        },
        write,
    };
    return {
        read: (views, row) => {
            const target = views[view];
            const index = row * unitStride + unitOffset;
            return [target[index], target[index + 1], target[index + 2], target[index + 3]];
        },
        write,
    };
};

/** Builds read/write closures over placed leaves, consuming them in shape order. */
const nodeOf = (shape: Shape, leaves: readonly Leaf[], next: { index: number }): Node => {
    if (shape.kind === "scalar") {
        const { view, unitStride, unitOffset } = leaves[next.index++];
        return shape.scalar === "boolean"
            ? { read: (views, row) => views[view][row * unitStride + unitOffset] !== 0, write: (views, row, value) => { views[view][row * unitStride + unitOffset] = Number(value); } }
            : { read: (views, row) => views[view][row * unitStride + unitOffset], write: (views, row, value) => { views[view][row * unitStride + unitOffset] = Number(value); } };
    }
    const first = next.index;
    const items = shape.items.map(item => nodeOf(item, leaves, next));
    const tupleLeaves = leaves.slice(first, next.index);
    // A tuple of same-typed non-boolean scalars, like a vec3: one loop over its leaves.
    if (shape.kind === "tuple" && shape.items.every(item => item.kind === "scalar" && item.scalar !== "boolean") && tupleLeaves.every(leaf => leaf.view === tupleLeaves[0].view)) {
        const view = tupleLeaves[0].view;
        const strides = tupleLeaves.map(leaf => leaf.unitStride);
        const offsets = tupleLeaves.map(leaf => leaf.unitOffset);
        const length = tupleLeaves.length;
        const [{ unitStride, unitOffset }] = tupleLeaves;
        // Lanes next to each other, as in a vec2, vec3 or vec4: array literals and straight-line stores.
        if (length >= 2 && length <= 4 && tupleLeaves.every((leaf, i) => leaf.unitStride === unitStride && leaf.unitOffset === unitOffset + i)) return lanesNode(view, unitStride, unitOffset, length);
        return {
            read: (views, row) => {
                const target = views[view];
                const value = new Array<number>(length);
                for (let i = 0; i < length; i++) value[i] = target[row * strides[i] + offsets[i]];
                return value;
            },
            write: (views, row, value) => {
                const target = views[view];
                if (Array.isArray(value)) for (let i = 0; i < length; i++) target[row * strides[i] + offsets[i]] = Number(value[i]);
                else for (let i = 0; i < length; i++) target[row * strides[i] + offsets[i]] = Number(element(value, i));
            },
        };
    }
    if (shape.kind === "tuple") {
        return {
            read: (views, row) => {
                const value = new Array<unknown>(items.length);
                for (let i = 0; i < items.length; i++) value[i] = items[i].read(views, row);
                return value;
            },
            write: (views, row, value) => {
                if (Array.isArray(value)) for (let i = 0; i < items.length; i++) items[i].write(views, row, value[i]);
                else for (let i = 0; i < items.length; i++) items[i].write(views, row, element(value, i));
            },
        };
    }
    const { names } = shape;
    return {
        read: (views, row) => {
            const value: { [name: string]: unknown } = {};
            for (let i = 0; i < names.length; i++) value[names[i]] = items[i].read(views, row);
            return value;
        },
        write: (views, row, value) => {
            for (let i = 0; i < names.length; i++) items[i].write(views, row, element(value, names[i]));
        },
    };
};

/** Whether code can be generated here; a content security policy without `'unsafe-eval'` forbids it. */
let generating = true;

/** A struct member's name as an object literal's key: quoted, and computed for `__proto__`, which a plain key would make the prototype. */
const propertyOf = (name: string): string => name === "__proto__" ? `[${JSON.stringify(name)}]` : JSON.stringify(name);

/**
 * A struct's or nested tuple's read and write as straight-line code: one literal of its leaves' loads, and one store per
 * leaf, rather than a call per leaf and properties added one at a time. Only numbers, view names and quoted member
 * names are written into the code. A value that isn't an object is written through `fallback`. Null where code can't
 * be generated.
 */
const generatedNode = (shape: Shape, leaves: readonly Leaf[], fallback: Node): Node | null => {
    if (!generating) return null;
    const at = (leaf: Leaf): string => `views.${leaf.view}[row * ${leaf.unitStride} + ${leaf.unitOffset}]`;
    let next = 0;
    const literal = (node: Shape): string => {
        if (node.kind === "scalar") {
            const leaf = leaves[next++];
            return leaf.scalar === "boolean" ? `${at(leaf)} !== 0` : at(leaf);
        }
        if (node.kind === "tuple") return `[${node.items.map(literal).join(", ")}]`;
        return `{ ${node.items.map((item, i) => `${propertyOf(node.names[i])}: ${literal(item)}`).join(", ")} }`;
    };
    const read = literal(shape);
    next = 0;
    let temporaries = 0;
    // A member of `value` is read directly when `value` is known to be an object, and through `element` otherwise.
    const stores = (node: Shape, value: string, object: boolean): string[] => {
        if (node.kind === "scalar") return [`${at(leaves[next++])} = Number(${value});`];
        const keys = node.kind === "struct" ? node.names.map(name => JSON.stringify(name)) : node.items.map((_, i) => String(i));
        return node.items.flatMap((item, i) => {
            const member = object ? `${value}[${keys[i]}]` : `element(${value}, ${keys[i]})`;
            if (item.kind === "scalar") return stores(item, member, false);
            const temporary = `t${temporaries++}`;
            return [`const ${temporary} = ${member};`, ...stores(item, temporary, false)];
        });
    };
    const body = [
        `return { read: (views, row) => (${read}), write: (views, row, value) => {`,
        `if (typeof value !== "object" || value === null) { fallback.write(views, row, value); return; }`,
        ...stores(shape, "value", true),
        "} };",
    ].join("\n");
    try {
        // The factory returns the node its body above makes.
        const node: Node = new Function("element", "fallback", body)(element, fallback);
        return node;
    }
    catch {
        generating = false;
        return null;
    }
};

const gpuLayoutOf = (schema: Schema): "storage" | "vertex" | undefined =>
    "type" in schema && (schema.type === "object" || schema.type === "array") ? schema.layout : undefined;

/**
 * How a schema's values are stored. Throws when a schema declares a GPU `layout` it can't meet,
 * naming the leaf and the fix, so registration fails rather than the GPU upload.
 */
/** A value without a schema isn't data, so it's stored as it is. */
export const layoutOf = (schema: Schema | undefined): Layout => {
    if (schema === undefined) return objectLayout;
    if ("const" in schema) return { kind: "constant", value: schema.const };
    if (isString(schema)) return stringLayout;
    const rules: Rules = gpuLayoutOf(schema) ?? "cpu";
    const shape = shapeOf(schema);
    if (shape === null) {
        if (rules !== "cpu") throw new Error(`A ${rules} layout needs numbers, integers, booleans, fixed-length tuples and structs with every property required.`);
        return objectLayout;
    }
    const placed = place(shape, [], rules);
    // An array of elements: each is padded to its alignment.
    const stride = roundUp(placed.size, placed.align);
    const leaves: Leaf[] = placed.leaves.map(leaf => ({
        ...leaf,
        unitStride: stride / bytesOf(leaf.view),
        unitOffset: leaf.offset / bytesOf(leaf.view),
    }));
    const built = nodeOf(shape, leaves, { index: 0 });
    // Scalars and tuples of scalars are already straight-line.
    const node = shape.kind === "struct" || (shape.kind === "tuple" && shape.items.some(item => item.kind !== "scalar")) ? generatedNode(shape, leaves, built) ?? built : built;
    return { kind: "linear", leaves, stride, read: node.read, write: node.write };
};

export const samePath = (a: Path, b: Path): boolean => a.length === b.length && a.every((key, i) => key === b[i]);
