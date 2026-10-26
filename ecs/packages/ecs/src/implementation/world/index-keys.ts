// © 2026 Adobe. MIT License. See /LICENSE for details.
import { declarationOf } from '../../interface/registry/index.js';
import { layoutOf, type Layout, type Leaf, type Scalar } from '../../interface/registry/layout.js';
import type { Storage } from './archetype.js';

/**
 * How an index encodes its key into 32-bit words that compare and hash as values do: each struct leaf as one word, two
 * for an f64, in an order-preserving form, so unsigned lexicographic word order is key order; an object part, or a
 * string as the world's thread holds it, as the id its value is interned under; a constant part as nothing.
 */
export type KeyPart =
    | { readonly kind: "leaves"; readonly leaves: readonly Leaf[]; readonly words: number; readonly first: number }
    | { readonly kind: "object"; readonly first: number; readonly interned: Interned }
    | { readonly kind: "constant"; readonly first: number };

/** Values of one object part by the id they're interned under, with how many entries hold each. */
export type Interned = {
    readonly ids: Map<unknown, number>;
    readonly values: unknown[];
    readonly counts: number[];
    readonly free: number[];
};

const createInterned = (): Interned => ({ ids: new Map(), values: [], counts: [], free: [] });

/** Words a scalar takes. */
const wordsOf = (scalar: Scalar): number => scalar === "f64" ? 2 : 1;

/** Each part of a key, by its layout, with the word it starts at; and the key's words in all. */
export const keyPartsOf = (layouts: readonly Layout[]): { readonly parts: readonly KeyPart[]; readonly words: number } => {
    let words = 0;
    const parts = layouts.map((layout): KeyPart => {
        const first = words;
        if (layout.kind === "constant") return { kind: "constant", first };
        if (layout.kind === "object" || layout.kind === "string") {
            words++;
            return { kind: "object", first, interned: createInterned() };
        }
        let count = 0;
        for (const leaf of layout.leaves) count += wordsOf(leaf.scalar);
        words += count;
        return { kind: "leaves", leaves: layout.leaves, words: count, first };
    });
    return { parts, words };
};

/** An index's first key part whose keys only the world's thread keeps, by their values: an object or a string. */
export const unsharedKeyOf = (key: readonly symbol[]): { readonly key: symbol; readonly what: string } | undefined => {
    for (const part of key) {
        const { kind } = layoutOf(declarationOf(part)?.type);
        if (kind === "object") return { key: part, what: "an object" };
        if (kind === "string") return { key: part, what: "a string, which the world's thread keeps keys of" };
    }
    return undefined;
};

/** Words a part takes. */
export const partWords = (part: KeyPart): number => part.kind === "leaves" ? part.words : part.kind === "object" ? 1 : 0;

/** NaN's encoding, after every other value. */
const nan = 0xFFFFFFFF;

/** An f32's bits in order-preserving form: -0 as +0, every NaN last. */
export const orderF32 = (bits: number): number => {
    if ((bits & 0x7F800000) === 0x7F800000 && (bits & 0x7FFFFF) !== 0) return nan;
    if (bits === 0x80000000) return 0x80000000;
    return (bits & 0x80000000) !== 0 ? ~bits >>> 0 : (bits | 0x80000000) >>> 0;
};

/** An f64's high and low words in order-preserving form, into `out[at]` and `out[at + 1]`. */
export const orderF64 = (high: number, low: number, out: Uint32Array, at: number): void => {
    if ((high & 0x7FF00000) === 0x7FF00000 && ((high & 0xFFFFF) | low) !== 0) {
        out[at] = nan;
        out[at + 1] = nan;
        return;
    }
    if (high === 0x80000000 && low === 0) {
        out[at] = 0x80000000;
        out[at + 1] = 0;
        return;
    }
    if ((high & 0x80000000) !== 0) {
        out[at] = ~high >>> 0;
        out[at + 1] = ~low >>> 0;
        return;
    }
    out[at] = (high | 0x80000000) >>> 0;
    out[at + 1] = low >>> 0;
};

/** A scalar's encoding of an i32's bits, a u32 or a boolean. */
const orderI32 = (bits: number): number => (bits ^ 0x80000000) >>> 0;

/**
 * Writes a row's key part, read from its storage, into `out` from `at`: leaves straight from the column's words, an
 * object part as its value's interned id, interning it with `intern` when given, or the id of none when it isn't.
 */
export const encodeStored = (part: KeyPart, storage: Storage, row: number, out: Uint32Array, at: number, intern: boolean): void => {
    if (part.kind === "constant") return;
    if (part.kind === "object") {
        out[at] = intern ? internValue(part.interned, storage.values[row]) : idOf(part.interned, storage.values[row]);
        return;
    }
    const { views } = storage;
    const { leaves } = part;
    let word = at;
    for (let k = 0; k < leaves.length; k++) {
        const leaf = leaves[k];
        const index = row * leaf.unitStride + leaf.unitOffset;
        switch (leaf.scalar) {
            case "f32": out[word++] = orderF32(views.u32[index]); break;
            case "i32": out[word++] = orderI32(views.u32[index]); break;
            case "u32": out[word++] = views.u32[index]; break;
            case "boolean": out[word++] = views.u8[index] === 0 ? 0 : 1; break;
            default: {
                // An f64's unit is 8 bytes: its words are the u32 view's at twice its index, low first.
                const low = views.u32[2 * index];
                const high = views.u32[2 * index + 1];
                orderF64(high, low, out, word);
                word += 2;
            }
        }
    }
};

/** Scratch for converting a number to a leaf's stored type and reading its bits. */
const scratch = new ArrayBuffer(8);
const f32 = new Float32Array(scratch);
const f64 = new Float64Array(scratch);
const i32 = new Int32Array(scratch);
const u32 = new Uint32Array(scratch);
const u8 = new Uint8Array(scratch);

/** A leaf's value converted to its stored type, as a write stores it, encoded into `out` from `at`; returns the next word. */
export const encodeScalar = (scalar: Scalar, value: unknown, out: Uint32Array, at: number): number => {
    const number = Number(value);
    switch (scalar) {
        case "f32":
            f32[0] = number;
            out[at] = orderF32(u32[0]);
            return at + 1;
        case "i32":
            i32[0] = number;
            out[at] = orderI32(u32[0]);
            return at + 1;
        case "u32":
            u32[0] = number;
            out[at] = u32[0];
            return at + 1;
        case "boolean":
            u8[0] = number;
            out[at] = u8[0] === 0 ? 0 : 1;
            return at + 1;
        default:
            f64[0] = number;
            orderF64(u32[1], u32[0], out, at);
            return at + 2;
    }
};

const element = (value: unknown, key: number | string): unknown => typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

/** The scalar at a leaf's path in a value. */
const leafValue = (value: unknown, leaf: Leaf): unknown => {
    let found = value;
    for (let k = 0; k < leaf.path.length; k++) found = element(found, leaf.path[k]);
    return found;
};

/**
 * Writes a key part given as a value, as a lookup's argument gives it, into `out` from `at`: converted to its leaves'
 * stored types, and an object part as its value's interned id, or `missing` for a value nothing holds.
 */
export const encodeValue = (part: KeyPart, value: unknown, out: Uint32Array, at: number): void => {
    if (part.kind === "constant") return;
    if (part.kind === "object") {
        out[at] = idOf(part.interned, value);
        return;
    }
    const { leaves } = part;
    if (leaves.length === 1 && leaves[0].path.length === 0) {
        encodeScalar(leaves[0].scalar, value, out, at);
        return;
    }
    let word = at;
    for (let k = 0; k < leaves.length; k++) word = encodeScalar(leaves[k].scalar, leafValue(value, leaves[k]), out, word);
};

/** The id of an object part's value nothing holds: no entry has it. */
export const missing = 0xFFFFFFFF;

/** What an object part's value is interned by: itself for a primitive, which a `Map` compares by SameValueZero, else its structure. */
const internKey = (value: unknown): unknown => typeof value === "object" && value !== null ? `\u0000${canonical(value)}` : value;

/** A value's structure as text, a plain object's keys sorted, so equal structures give equal text. */
const canonical = (value: unknown): string => JSON.stringify(value, (_, inner: unknown) => {
    if (typeof inner !== "object" || inner === null || Array.isArray(inner)) return inner;
    const sorted: { [key: string]: unknown } = {};
    for (const key of Object.keys(inner).sort()) sorted[key] = Reflect.get(inner, key);
    return sorted;
});

/** The id an object part's value is interned under, or `missing`. */
const idOf = (interned: Interned, value: unknown): number => interned.ids.get(internKey(value)) ?? missing;

/** Interns a value, as one more entry holds it, and returns its id. */
const internValue = (interned: Interned, value: unknown): number => {
    const key = internKey(value);
    const found = interned.ids.get(key);
    if (found !== undefined) {
        interned.counts[found]++;
        return found;
    }
    const id = interned.free.pop() ?? interned.values.length;
    interned.ids.set(key, id);
    interned.values[id] = value;
    interned.counts[id] = 1;
    return id;
};

/** One fewer entry holds the value interned under `id`; with none, it's forgotten. */
export const release = (part: KeyPart, id: number): void => {
    if (part.kind !== "object" || id === missing) return;
    const { interned } = part;
    if (--interned.counts[id] > 0) return;
    interned.ids.delete(internKey(interned.values[id]));
    interned.values[id] = undefined;
    interned.free.push(id);
};

/** Interns an id once more, for an entry copied with its key. */
export const retain = (part: KeyPart, id: number): void => {
    if (part.kind === "object" && id !== missing) part.interned.counts[id]++;
};

/** A multiply-xorshift hash of `count` words from `at`, the same on every thread. */
export const hashWords = (words: Uint32Array, at: number, count: number): number => {
    let hash = 0x811C9DC5;
    for (let k = 0; k < count; k++) {
        hash = Math.imul(hash ^ words[at + k], 0x9E3779B1);
        hash ^= hash >>> 15;
    }
    hash = Math.imul(hash ^ (hash >>> 16), 0x85EBCA6B);
    hash = Math.imul(hash ^ (hash >>> 13), 0xC2B2AE35);
    return (hash ^ (hash >>> 16)) >>> 0;
};

/** Code points of two strings compared, as `@adobe/data` orders strings, never by locale. */
export const compareStrings = (a: string, b: string): number => {
    const length = Math.min(a.length, b.length);
    for (let k = 0; k < length; k++) {
        const x = a.charCodeAt(k);
        const y = b.charCodeAt(k);
        if (x === y) continue;
        // A surrogate encodes a code point above every unit that isn't one.
        const xs = x >= 0xD800 && x <= 0xDFFF;
        const ys = y >= 0xD800 && y <= 0xDFFF;
        if (xs !== ys) return xs ? 1 : -1;
        return x < y ? -1 : 1;
    }
    return a.length - b.length;
};

/** Two values of an object part in order: strings by code point, anything else as equal. */
export const compareObjects = (a: unknown, b: unknown): number =>
    typeof a === "string" && typeof b === "string" ? compareStrings(a, b) : 0;

/**
 * Whether a world keeps an index as a sorted table: a sorted one, and one without a key, whose entities a sorted table
 * keeps in entity order, an entity entering or leaving moving at most a block's entries.
 */
export const keptSorted = (declaration: { readonly key: readonly unknown[]; readonly sorted?: boolean }): boolean => declaration.sorted === true || declaration.key.length === 0;
