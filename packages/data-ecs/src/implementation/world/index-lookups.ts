import type { Archetype } from './archetype.js';
import type { Scalar } from '../../interface/registry/layout.js';
import { encodeScalar, encodeValue, hashWords, orderF32, orderF64, type KeyPart } from './index-keys.js';
import { entryWords, findBucket, lengthOf, recordKey, recordLength, recordStart, startOf } from './index-hash.js';
import type { WorldIndex } from './indexes.js';
import { createRow, type Row } from './rows.js';
import { idOf, type Key, type State } from './state.js';

/** A system's `lastRun` while it runs, which its lists' `changed` compares with: -1 in finalizers, which have none. */
export type Since = { value: number };

/**
 * How a lookup call passes its key, by argument: `0` a value whole, `n` a tuple literal flattened into `n` scalars, and
 * for a comparison literal its operators, each with its operand passed in the same way. The plugin gives each call
 * site in a main-thread body its shape, so a literal builds no array or object.
 */
export type Shape = readonly (number | readonly (readonly [string, number])[])[];

/** A main-thread lookup through an index, behind the function a body calls. */
export type IndexLookup = {
    readonly state: State;
    readonly index: WorldIndex;
    readonly unique: boolean;
    /** What rows read, and the components whose changes its lists report. */
    readonly reads: readonly Key[];
    readonly readIds: readonly number[];
    readonly watched: readonly number[];
    readonly since: Since;
};

/** The lookup behind each function bodies are given, for the plugin's call sites. */
const lookups = new WeakMap<object, IndexLookup>();

/** The index lookup behind a function a body was given, or undefined for any other. */
export const indexLookupOf = (lookup: unknown): IndexLookup | undefined => typeof lookup === "function" ? lookups.get(lookup) : undefined;

/** Rows a list's `at` gives, each bound to the archetype of the entry it was last pointed at. */
type Pool = { readonly rows: Row[]; readonly archetypes: number[]; readonly versions: number[] };

/** Points row `n` of a pool at an entry's archetype and row, binding it again only when its archetype or that's arrays changed. */
const rowAt = (lookup: IndexLookup, pool: Pool, n: number, archetypeId: number, row: number): object => {
    const archetype: Archetype = lookup.state.archetypes[archetypeId];
    let found = pool.rows[n];
    if (found === undefined) {
        found = pool.rows[n] = createRow(lookup.state, archetype, lookup.reads, lookup.readIds, []);
        pool.archetypes[n] = archetypeId;
        pool.versions[n] = archetype.version;
    }
    else if (pool.archetypes[n] !== archetypeId || pool.versions[n] !== archetype.version) {
        found.bind(archetype);
        pool.archetypes[n] = archetypeId;
        pool.versions[n] = archetype.version;
    }
    found.index = row;
    return found.value;
};

/**
 * A list of rows a lookup found: a hash index's bucket. Valid until its site looks up again, and each row until the
 * list does.
 */
export type List = { readonly length: number; readonly changed: boolean; at(index: number): object | undefined };

/** What a list points at: a bucket, or -1 for a key no bucket holds. */
type Found = { bucket: number };

const createList = (lookup: IndexLookup, found: Found): List => {
    const pool: Pool = { rows: [], archetypes: [], versions: [] };
    const { hash } = lookup.index;
    return {
        get length(): number {
            return found.bucket < 0 ? 0 : hash.records[found.bucket * hash.stride + recordLength];
        },
        get changed(): boolean {
            const { bucket } = found;
            const since = lookup.since.value;
            if (bucket < 0) return hash.cleared > since;
            if (hash.ticks[bucket] > since) return true;
            const { watched } = lookup;
            for (let k = 0; k < watched.length; k++) if ((hash.watched.get(watched[k])?.[bucket] ?? Infinity) > since) return true;
            return false;
        },
        at(position: number): object | undefined {
            const { bucket } = found;
            const record = bucket * hash.stride;
            if (bucket < 0 || !(position >= 0 && position < hash.records[record + recordLength])) return undefined;
            const at = (hash.records[record + recordStart] + position) * entryWords;
            return rowAt(lookup, pool, position, hash.entries[at + 1], hash.entries[at + 2]);
        },
    };
};

/** Words of the key a site encodes its arguments into. */
const keyOf = (lookup: IndexLookup): Uint32Array => new Uint32Array(Math.max(1, lookup.index.words));

/** Whether a part's leaves are a tuple's elements, each one scalar. */
const simpleTuple = (part: KeyPart & { readonly kind: "leaves" }): boolean => {
    for (let k = 0; k < part.leaves.length; k++) if (part.leaves[k].path.length !== 1) return false;
    return true;
};

/** Encodes a key part from a site's arguments starting at `next`, as its shape passes it; returns the next argument. */
const encodePart = (part: KeyPart, form: number, values: readonly unknown[], next: number, key: Uint32Array): number => {
    if (form === 0 || part.kind !== "leaves" || part.leaves.length !== form || !simpleTuple(part)) {
        // A literal the part's leaves don't take one scalar each from is rebuilt as the value it was.
        encodeValue(part, form === 0 ? values[next] : values.slice(next, next + form), key, part.first);
        return next + Math.max(1, form);
    }
    let word = part.first;
    for (let k = 0; k < form; k++) word = encodeScalar(part.leaves[k].scalar, values[next + k], key, word);
    return next + form;
};

/**
 * One call site's lookup: its list, or for a unique index its row, reused each time it runs. `find` takes the values
 * its shape passes, in order.
 */
export type Site = { readonly find: (...values: unknown[]) => unknown };

/** Where a site's argument goes: a scalar leaf's word, or a whole key part. */
type Destination = { readonly part: number; readonly scalar: Scalar | null; readonly word: number };

/** Where each argument of a shape goes, or null for a shape the index's parts don't take. */
const destinationsOf = (parts: readonly KeyPart[], shape: Shape): readonly Destination[] | null => {
    if (shape.length !== parts.length) return null;
    const destinations: Destination[] = [];
    for (let p = 0; p < parts.length; p++) {
        const form = shape[p];
        const part = parts[p];
        if (typeof form !== "number") return null;
        if (form === 0) {
            const leaf = part.kind === "leaves" && part.leaves.length === 1 && part.leaves[0].path.length === 0 ? part.leaves[0] : null;
            destinations.push({ part: p, scalar: leaf?.scalar ?? null, word: part.first });
            continue;
        }
        if (part.kind !== "leaves" || part.leaves.length !== form || part.leaves.some(leaf => leaf.path.length !== 1)) return null;
        let word = part.first;
        for (const leaf of part.leaves) {
            destinations.push({ part: p, scalar: leaf.scalar, word });
            word += leaf.scalar === "f64" ? 2 : 1;
        }
    }
    return destinations;
};

/** A statement encoding argument `a${k}` into the key's words where it goes. */
const encodeStatement = ({ part, scalar, word }: Destination, k: number): string => {
    switch (scalar) {
        case "i32": return `key[${word}] = ((a${k} | 0) ^ 0x80000000) >>> 0;`;
        case "u32": return `key[${word}] = a${k} >>> 0;`;
        case "f32": return `f32[0] = a${k}; key[${word}] = orderF32(u32[0]);`;
        case "f64": return `f64[0] = a${k}; orderF64(u32[1], u32[0], key, ${word});`;
        case "boolean": return `u8[0] = a${k}; key[${word}] = u8[0] === 0 ? 0 : 1;`;
        default: return `encodeValue(parts[${part}], a${k}, key, ${word});`;
    }
};

/** Whether code can be generated here; a content security policy without `'unsafe-eval'` forbids it. */
let generating = true;

const scratch = new ArrayBuffer(8);
const f32 = new Float32Array(scratch);
const f64 = new Float64Array(scratch);
const u32 = new Uint32Array(scratch);
const u8 = new Uint8Array(scratch);

/**
 * A site's lookup of a hash index generated for its shape: one straight-line encoding of each argument into the key's
 * words, the hash and the probe inline. Null where code can't be generated, or for a shape it doesn't take.
 */
const generatedFind = (lookup: IndexLookup, shape: Shape, list: List, found: Found, pool: Pool): ((...values: unknown[]) => unknown) | null => {
    const { index } = lookup;
    const destinations = destinationsOf(index.parts, shape);
    if (!generating || destinations === null) return null;
    const { words } = index;
    const parameters = destinations.map((_, k) => `a${k}`);
    const same = Array.from({ length: words }, (_, w) => ` && records[base + ${recordKey + w}] === key[${w}]`).join("");
    const body = [
        `return (${parameters.join(", ")}) => {`,
        ...destinations.map(encodeStatement),
        "let h = 0x811C9DC5;",
        ...Array.from({ length: words }, (_, w) => `h = Math.imul(h ^ key[${w}], 0x9E3779B1); h ^= h >>> 15;`),
        "h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B); h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35); h = (h ^ (h >>> 16)) >>> 0;",
        "const slots = table.slots, records = table.records, mask = (slots.length >> 1) - 1;",
        "let bucket = -1;",
        "for (let slot = h & mask; ; slot = (slot + 1) & mask) {",
        "const filled = slots[2 * slot + 1]; if (filled === 0) break;",
        `if (slots[2 * slot] !== h) continue;`,
        `const base = (filled - 1) * ${index.hash.stride};`,
        `if (true${same}) { bucket = filled - 1; break; }`,
        "}",
        ...lookup.unique ? [
            `if (bucket < 0 || records[bucket * ${index.hash.stride} + ${recordLength}] === 0) return null;`,
            `const at = records[bucket * ${index.hash.stride} + ${recordStart}] * ${entryWords};`,
            "const archetypeId = table.entries[at + 1], archetype = archetypes[archetypeId], row = pool.rows[0];",
            "if (row === undefined || pool.archetypes[0] !== archetypeId || pool.versions[0] !== archetype.version) return rowAt(lookup, pool, 0, archetypeId, table.entries[at + 2]);",
            "row.index = table.entries[at + 2];",
            "return row.value;",
        ] : ["found.bucket = bucket;", "return list;"],
        "};",
    ].join("\n");
    try {
        const factory = new Function("key", "table", "found", "list", "pool", "lookup", "rowAt", "encodeValue", "parts", "orderF32", "orderF64", "f32", "f64", "u32", "u8", "archetypes", body);
        // The factory returns the function its body above makes.
        const made: (...values: unknown[]) => unknown = factory(new Uint32Array(Math.max(1, words)), index.hash, found, list, pool, lookup, rowAt, encodeValue, index.parts, orderF32, orderF64, f32, f64, u32, u8, lookup.state.archetypes);
        return made;
    }
    catch {
        generating = false;
        return null;
    }
};

/** A site's lookup by `shape`: each argument a key part's value, or its scalars flattened, of the index's parts in order. */
export const createSite = (lookup: IndexLookup, shape: Shape): Site => {
    const { index, unique } = lookup;
    const key = keyOf(lookup);
    const found: Found = { bucket: -1 };
    const list = createList(lookup, found);
    const pool: Pool = { rows: [], archetypes: [], versions: [] };
    const generated = generatedFind(lookup, shape, list, found, pool);
    if (generated !== null) return { find: generated };
    const { parts, words, hash } = index;
    const forms = shape.map(form => typeof form === "number" ? form : 0);
    return {
        find: (...values) => {
            let next = 0;
            for (let p = 0; p < parts.length; p++) next = encodePart(parts[p], forms[p] ?? 0, values, next, key);
            found.bucket = findBucket(hash, key, 0, hashWords(key, 0, words));
            if (!unique) return list;
            const { bucket } = found;
            if (bucket < 0 || lengthOf(hash, bucket) === 0) return null;
            const at = startOf(hash, bucket) * entryWords;
            return rowAt(lookup, pool, 0, hash.entries[at + 1], hash.entries[at + 2]);
        },
    };
};

/** The shape of a call that passes each key part whole. */
const wholeShapes: Shape[] = [];
const wholeShape = (count: number): Shape => wholeShapes[count] ??= new Array<number>(count).fill(0);

/**
 * A lookup through an index for a main-thread body: called with a key, as code the plugin didn't rewrite calls it,
 * it makes a new list each time; the plugin's call sites reuse their own (`prepared-lookup.ts`).
 */
export const createIndexLookup = (state: State, index: WorldIndex, declared: { readonly read?: readonly Key[]; readonly changed?: readonly Key[] }, since: Since): (...key: unknown[]) => unknown => {
    const reads = declared.read ?? [];
    const lookup: IndexLookup = {
        state,
        index,
        unique: index.unique,
        reads,
        readIds: reads.map(key => idOf(state, key)),
        watched: (declared.changed ?? []).map(key => idOf(state, key)),
        since,
    };
    const call = (...key: unknown[]): unknown => createSite(lookup, wholeShape(key.length)).find(...key);
    lookups.set(call, lookup);
    return call;
};
