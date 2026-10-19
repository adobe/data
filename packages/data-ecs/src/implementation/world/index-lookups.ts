import type { Archetype } from './archetype.js';
import type { Scalar } from '../../interface/registry/layout.js';
import { encodeScalar, encodeValue, hashWords, orderF32, orderF64, partWords, type KeyPart } from './index-keys.js';
import { entryWords, findBucket, lengthOf, recordKey, recordLength, recordStart, startOf, type HashTable } from './index-hash.js';
import { blockAt, blockBase, bound, firstPosition, treeMaximum, type SortedTable } from './index-sorted.js';
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

const createList = (lookup: IndexLookup, hash: HashTable, found: Found): List => {
    const pool: Pool = { rows: [], archetypes: [], versions: [] };
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
const generatedFind = (lookup: IndexLookup, hash: HashTable, shape: Shape, list: List, found: Found, pool: Pool): ((...values: unknown[]) => unknown) | null => {
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
        `const base = (filled - 1) * ${hash.stride};`,
        `if (true${same}) { bucket = filled - 1; break; }`,
        "}",
        ...lookup.unique ? [
            `if (bucket < 0 || records[bucket * ${hash.stride} + ${recordLength}] === 0) return null;`,
            `const at = records[bucket * ${hash.stride} + ${recordStart}] * ${entryWords};`,
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
        const made: (...values: unknown[]) => unknown = factory(new Uint32Array(Math.max(1, words)), hash, found, list, pool, lookup, rowAt, encodeValue, index.parts, orderF32, orderF64, f32, f64, u32, u8, lookup.state.archetypes);
        return made;
    }
    catch {
        generating = false;
        return null;
    }
};

/** A site's lookup by `shape`: each argument a key part's value, or its scalars flattened, of the index's parts in order. */
export const createSite = (lookup: IndexLookup, shape: Shape): Site => {
    const { index } = lookup;
    if (index.sorted !== null) return createSortedSite(lookup, index.sorted, shape);
    if (index.hash === null) return { find: () => null };
    return createHashSite(lookup, index.hash, shape);
};

/** A site's lookup of a hash index: by the whole key. */
const createHashSite = (lookup: IndexLookup, hash: HashTable, shape: Shape): Site => {
    const { index, unique } = lookup;
    const key = keyOf(lookup);
    const found: Found = { bucket: -1 };
    const list = createList(lookup, hash, found);
    const pool: Pool = { rows: [], archetypes: [], versions: [] };
    const generated = generatedFind(lookup, hash, shape, list, found, pool);
    if (generated !== null) return { find: generated };
    const { parts, words } = index;
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

/** A sorted list's rows: positions `low` to `high`, and for a comparison with `"!="` a second run, `second` to `end`. */
type Range = { low: number; high: number; second: number; end: number };

/** A sorted list's place as `at` walks it: the position in `order` of a block, the position of its first entry, and its length. */
type Cursor = { k: number; first: number; length: number };

/** A list of a sorted index's rows, in key order, then entity order. */
const createSortedList = (lookup: IndexLookup, sorted: SortedTable, range: Range, cursor: Cursor): List => {
    const pool: Pool = { rows: [], archetypes: [], versions: [] };
    const { words, stride } = sorted;
    /** Whether a tree's ticks over the blocks around positions `low` to `high` are newer than `since`. */
    const newer = (tree: Float64Array, low: number, high: number, since: number): boolean => {
        const last = sorted.size - 1;
        return treeMaximum(sorted, tree, blockAt(sorted, Math.min(last, Math.max(low - 1, 0))), blockAt(sorted, Math.min(last, high))) > since;
    };
    const runChanged = (low: number, high: number, since: number): boolean => {
        if (newer(sorted.tree, low, high, since)) return true;
        const { watched } = lookup;
        for (let k = 0; k < watched.length; k++) {
            const watch = sorted.watched.get(watched[k]);
            if (watch === undefined || newer(watch.tree, low, high, since)) return true;
        }
        return false;
    };
    return {
        get length(): number {
            return range.high - range.low + range.end - range.second;
        },
        get changed(): boolean {
            const since = lookup.since.value;
            if (sorted.blocks === 0) return sorted.cleared > since;
            return runChanged(range.low, range.high, since) || (range.end > range.second && runChanged(range.second, range.end, since));
        },
        at(index: number): object | undefined {
            const first = range.high - range.low;
            if (!(index >= 0 && index < first + range.end - range.second)) return undefined;
            const position = index < first ? range.low + index : range.second + index - first;
            if (!(position >= cursor.first && position < cursor.first + cursor.length)) {
                cursor.k = blockAt(sorted, position);
                cursor.first = firstPosition(sorted, cursor.k);
                cursor.length = sorted.lengths[sorted.order[cursor.k]];
            }
            const base = blockBase(sorted, sorted.order[cursor.k]) + (position - cursor.first) * stride;
            return rowAt(lookup, pool, index, sorted.entries[base + words + 1], sorted.entries[base + words + 2]);
        },
    };
};

/** Whether a value a lookup was given for a sorted part is a comparison: a sorted part's own values are never plain objects. */
const isComparison = (value: unknown): value is { readonly [operator: string]: unknown } => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A site's lookup of a sorted index: a prefix of the key, whose last part may be a comparison, giving the rows in key
 * order; for a unique index, a whole key of plain values gives the row or null.
 */
const createSortedSite = (lookup: IndexLookup, sorted: SortedTable, shape: Shape): Site => {
    const { index, unique } = lookup;
    const { parts } = index;
    const probe = keyOf(lookup);
    const objects: unknown[] = new Array<unknown>(parts.length).fill(undefined);
    const range: Range = { low: 0, high: 0, second: 0, end: 0 };
    const cursor: Cursor = { k: 0, first: 0, length: 0 };
    const list = createSortedList(lookup, sorted, range, cursor);
    const pool: Pool = { rows: [], archetypes: [], versions: [] };
    const found = { k: 0, offset: 0 };
    /**
     * The first position whose key's first `count` words are after the probe's, or not before them. A lower bound, the
     * first row `at` gives, leaves the cursor at its block.
     */
    const at = (count: number, after: boolean): number => {
        if (count === 0) return after ? sorted.size : 0;
        bound(sorted, probe, objects, count, after, found);
        if (found.k >= sorted.blocks) return sorted.size;
        const first = firstPosition(sorted, found.k);
        if (!after) {
            cursor.k = found.k;
            cursor.first = first;
            cursor.length = sorted.lengths[sorted.order[found.k]];
        }
        return first + found.offset;
    };
    /** Encodes part `p`'s value, the site's values from `next` as `form` passes it, into the probe; returns the next value. */
    const encode = (p: number, form: number, values: readonly unknown[], next: number): number => {
        const part = parts[p];
        if (part.kind === "object") objects[p] = form === 0 ? values[next] : values.slice(next, next + form);
        else if (form === 0) encodeValue(part, values[next], probe, part.first);
        else if (part.kind === "leaves" && part.leaves.length === form && simpleTuple(part)) {
            let word = part.first;
            for (let k = 0; k < form; k++) word = encodeScalar(part.leaves[k].scalar, values[next + k], probe, word);
        }
        else encodeValue(part, values.slice(next, next + form), probe, part.first);
        return next + Math.max(1, form);
    };
    /** The site's values, copied from its arguments, reused. */
    const values: unknown[] = [];
    let low = 0;
    let high = 0;
    let unequalLow = -1;
    let unequalHigh = -1;
    /** Narrows the range by an operator of the last part given, its operand the site's values from `next` as `operand` passes it. */
    const compare = (last: number, words: number, operator: string, operand: number, from: readonly unknown[], next: number): void => {
        encode(last, operand, from, next);
        switch (operator) {
            case ">=": low = Math.max(low, at(words, false)); break;
            case ">": low = Math.max(low, at(words, true)); break;
            case "<": high = Math.min(high, at(words, false)); break;
            case "<=": high = Math.min(high, at(words, true)); break;
            case "==": low = Math.max(low, at(words, false)); high = Math.min(high, at(words, true)); break;
            case "!=": unequalLow = at(words, false); unequalHigh = at(words, true); break;
            default: break;
        }
    };
    const held: unknown[] = [undefined];
    const find = (): unknown => {
        cursor.length = 0;
        cursor.first = 0;
        range.second = range.end = 0;
        const given = Math.min(shape.length, parts.length);
        let next = 0;
        for (let p = 0; p < given - 1; p++) {
            const form = shape[p];
            next = encode(p, typeof form === "number" ? form : 0, values, next);
        }
        if (given === 0) {
            range.low = 0;
            range.high = sorted.size;
            return list;
        }
        const last = given - 1;
        const lastForm = shape[last];
        const prefix = parts[last].first;
        const words = prefix + partWords(parts[last]);
        const whole = typeof lastForm === "number" ? (lastForm === 0 ? values[next] : undefined) : undefined;
        if (typeof lastForm === "number" && !(lastForm === 0 && isComparison(whole))) {
            encode(last, lastForm, values, next);
            range.low = at(words, false);
            range.high = at(words, true);
            if (!unique || given < parts.length) return list;
            if (range.high === range.low) return null;
            bound(sorted, probe, objects, words, false, found);
            const base = blockBase(sorted, sorted.order[found.k]) + found.offset * sorted.stride;
            return rowAt(lookup, pool, 0, sorted.entries[base + sorted.words + 1], sorted.entries[base + sorted.words + 2]);
        }
        // A comparison on the last part given, within the prefix before it.
        low = at(prefix, false);
        high = prefix === 0 ? sorted.size : at(prefix, true);
        unequalLow = -1;
        unequalHigh = -1;
        if (typeof lastForm === "number") {
            const comparison = isComparison(whole) ? whole : {};
            for (const operator in comparison) {
                held[0] = comparison[operator];
                compare(last, words, operator, 0, held, 0);
            }
        }
        else {
            for (let k = 0; k < lastForm.length; k++) {
                const [operator, operand] = lastForm[k];
                compare(last, words, operator, operand, values, next);
                next += Math.max(1, operand);
            }
        }
        if (high < low) high = low;
        range.low = low;
        range.high = high;
        if (unequalLow >= 0) {
            range.high = Math.min(high, Math.max(low, unequalLow));
            range.second = Math.max(low, Math.min(high, unequalHigh));
            range.end = high;
            if (range.second >= range.end) range.second = range.end = 0;
        }
        return list;
    };
    return {
        find: (a0?: unknown, a1?: unknown, a2?: unknown, a3?: unknown, a4?: unknown, a5?: unknown, a6?: unknown, a7?: unknown,
            a8?: unknown, a9?: unknown, a10?: unknown, a11?: unknown, a12?: unknown, a13?: unknown, a14?: unknown, a15?: unknown): unknown => {
            values[0] = a0; values[1] = a1; values[2] = a2; values[3] = a3; values[4] = a4; values[5] = a5; values[6] = a6; values[7] = a7;
            values[8] = a8; values[9] = a9; values[10] = a10; values[11] = a11; values[12] = a12; values[13] = a13; values[14] = a14; values[15] = a15;
            return find();
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
