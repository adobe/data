// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Scalar } from '../../interface/registry/layout.js';
import { encodeScalar, encodeValue, hashWords, orderF32, orderF64, partWords, type KeyPart } from './index-keys.js';
import { entryWords, findBucket, isHashTable, lengthOf, recordKey, recordLength, recordStart, sortBucket, startOf, type HashView } from './index-hash.js';
import { blockAt, blockBase, bound, firstPosition, treeMaximum, type SortedView } from './index-sorted.js';
import { sharedRows, type Row, type RowArchetype, type RowHost } from './rows.js';
import { idOf, type Key, type State } from './state.js';
import { watchedBy } from '../../interface/registry/index.js';

/** A system's `lastRun` while it runs, which its lists' `changed` compares with: -1 in finalizers, which have none. */
export type Since = { value: number };

/**
 * How a lookup call passes its key, by argument: `0` a value whole, `n` a tuple literal flattened into `n` scalars, and
 * for a comparison literal its operators, each with its operand passed in the same way. The plugin gives each call
 * site in a main-thread body its shape, so a literal builds no array or object.
 */
export type Shape = readonly (number | readonly (readonly [string, number])[])[];

/** What a lookup reads of an index: on the world's thread the index, on a joined thread its views of it. */
export type IndexView = {
    readonly parts: readonly KeyPart[];
    readonly words: number;
    readonly unique: boolean;
    readonly hash: HashView | null;
    readonly sorted: SortedView | null;
};

/** An archetype a lookup's rows bind to, by its id: the world's, or a joined thread's view of it. */
export type LookupArchetype = RowArchetype & { readonly version: number };

/** A lookup through an index from a body, behind the function it calls, on the world's thread or a joined thread. */
export type IndexLookup = {
    readonly rows: RowHost;
    readonly archetypeAt: (id: number) => LookupArchetype | undefined;
    readonly index: IndexView;
    readonly unique: boolean;
    /** What rows read, and the components whose changes its lists report. */
    readonly reads: readonly Key[];
    readonly readIds: readonly number[];
    readonly watched: readonly number[];
    readonly since: Since;
    /**
     * How many times the world's archetypes' arrays were replaced, while which rows bound to them stay current: on the
     * world's thread. Null on a joined thread, whose rows check their archetype's version each time.
     */
    readonly replaced: { readonly count: number } | null;
};

/** The lookup behind each function bodies are given, for the plugin's call sites. */
const lookups = new WeakMap<object, IndexLookup>();

/** The index lookup behind a function a body was given, or undefined for any other. */
export const indexLookupOf = (lookup: unknown): IndexLookup | undefined => typeof lookup === "function" ? lookups.get(lookup) : undefined;

/** Rows a list's `at` gives, each bound to the archetype of the entry it was last pointed at, made by `make`. */
type Pool = {
    /** By position: its row, or undefined for one not made yet. */
    readonly rows: (Row | undefined)[];
    readonly archetypes: number[];
    readonly versions: number[];
    readonly make: (archetype: RowArchetype) => Row;
    /** The lookup's `replaced` count when every row was last checked against its archetype's version. */
    replaced: number;
    /** The longest list a lookup made rows ahead for. */
    ahead: number;
};

/** Each lookup's maker of rows, so every row its sites give shares one hidden class. */
const makers = new WeakMap<IndexLookup, (archetype: RowArchetype) => Row>();

const poolOf = (lookup: IndexLookup): Pool => {
    let make = makers.get(lookup);
    if (make === undefined) makers.set(lookup, make = sharedRows(lookup.rows, lookup.reads, lookup.readIds));
    return { rows: [], archetypes: [], versions: [], make, replaced: lookup.replaced?.count ?? 0, ahead: 0 };
};

/** Binds row `n` of a pool to an archetype, making it first if the pool has none there yet. */
const bindRow = (pool: Pool, n: number, archetypeId: number, archetype: LookupArchetype): Row => {
    const { rows } = pool;
    // Positions before `n` are filled first, so the arrays stay dense.
    while (rows.length < n) {
        rows.push(undefined);
        pool.archetypes.push(-1);
        pool.versions.push(-1);
    }
    let found = rows[n];
    if (found === undefined) found = rows[n] = pool.make(archetype);
    else found.bind(archetype);
    pool.archetypes[n] = archetypeId;
    pool.versions[n] = archetype.version;
    return found;
};

/** Rows a lookup makes ahead of `at`, at most: a long list's later rows are made as `at` reaches them. */
const madeAhead = 256;

/**
 * Makes a pool's rows up to `length`, at most `madeAhead`, bound to an archetype entries likely have, when a site's
 * lookup found a list longer than any before. Making them here, not in `at`, keeps the one-time work out of the path a
 * body inlines.
 */
const growPool = (lookup: IndexLookup, pool: Pool, length: number, archetypeId: number): void => {
    pool.ahead = length;
    const archetype = lookup.archetypeAt(archetypeId);
    if (archetype === undefined) return;
    const end = Math.min(length, madeAhead);
    for (let n = pool.rows.length; n < end; n++) bindRow(pool, n, archetypeId, archetype);
};

/** Binds again the rows whose archetype's arrays were replaced since the pool last checked, on the world's thread. */
const refreshPool = (lookup: IndexLookup, pool: Pool, replaced: { readonly count: number }): void => {
    for (let n = 0; n < pool.rows.length; n++) {
        const archetype = pool.rows[n] === undefined ? undefined : lookup.archetypeAt(pool.archetypes[n]);
        if (archetype !== undefined && archetype.version !== pool.versions[n]) bindRow(pool, n, pool.archetypes[n], archetype);
    }
    pool.replaced = replaced.count;
};

/** Binds row `n` again to an entry's archetype, or makes it, when its archetype or that's arrays changed. */
const reboundAt = (lookup: IndexLookup, pool: Pool, n: number, archetypeId: number, row: number): object | undefined => {
    const { replaced } = lookup;
    if (replaced !== null && pool.replaced !== replaced.count) refreshPool(lookup, pool, replaced);
    const archetype = lookup.archetypeAt(archetypeId);
    if (archetype === undefined) return undefined;
    const current = pool.rows[n];
    const found = current !== undefined && pool.archetypes[n] === archetypeId && pool.versions[n] === archetype.version ? current : bindRow(pool, n, archetypeId, archetype);
    found.index = row;
    return found.value;
};

/** Whether row `n` of a pool is bound to its archetype's current arrays, on a joined thread. */
const currentVersion = (lookup: IndexLookup, pool: Pool, n: number, archetypeId: number): boolean =>
    pool.versions[n] === lookup.archetypeAt(archetypeId)?.version;

/**
 * Points row `n` of a pool at an entry's archetype and row, binding it again only when its archetype or that's arrays
 * changed: on the world's thread, when any archetype's were replaced since the pool last checked.
 */
const rowAt = (lookup: IndexLookup, pool: Pool, n: number, archetypeId: number, row: number): object | undefined => {
    const found = pool.rows[n];
    const { replaced } = lookup;
    if (found === undefined || pool.archetypes[n] !== archetypeId || (replaced === null ? !currentVersion(lookup, pool, n, archetypeId) : pool.replaced !== replaced.count)) return reboundAt(lookup, pool, n, archetypeId, row);
    found.index = row;
    return found.value;
};

/**
 * A list of rows a lookup found: a hash index's bucket. Valid until its site looks up again, and each row until the
 * list does.
 */
export type List = { readonly length: number; readonly changed: boolean; at(index: number): object | undefined };

/** A list's state, hidden on it, which the functions every list of its kind shares read through `this`. */
const listState = Symbol("list");

/**
 * Gives a list its accessors and its state. Every list of a kind has the same functions, defined in the same order, so
 * lists share one hidden class and a body's loads of `length` and `at` stay monomorphic whichever site made the list.
 */
const shareList = <S>(state: S, length: (this: { readonly [listState]: S }) => number, changed: (this: { readonly [listState]: S }) => boolean, at: (this: { readonly [listState]: S }, index: number) => object | undefined): List => {
    const list = {};
    Object.defineProperty(list, listState, { value: state });
    Object.defineProperty(list, "length", { get: length, enumerable: true, configurable: true });
    Object.defineProperty(list, "changed", { get: changed, enumerable: true, configurable: true });
    Object.defineProperty(list, "at", { value: at, enumerable: true, configurable: true, writable: true });
    // Its properties are the ones `List` names, just defined.
    return list as List;
};

/** What a hash index's list points at, a bucket or -1 for a key no bucket holds, and what it reads. */
type Found = { bucket: number; readonly lookup: IndexLookup; readonly hash: HashView; readonly pool: Pool };
type HashList = { readonly [listState]: Found };

const hashLength = function (this: HashList): number {
    const { bucket, hash } = this[listState];
    return bucket < 0 ? 0 : hash.records[bucket * hash.stride + recordLength];
};

const hashChanged = function (this: HashList): boolean {
    const { bucket, hash, lookup } = this[listState];
    const since = lookup.since.value;
    if (bucket < 0) return hash.cleared > since;
    if (hash.ticks[bucket] > since) return true;
    const { watched } = lookup;
    for (let k = 0; k < watched.length; k++) if ((hash.watched.get(watched[k])?.[bucket] ?? Infinity) > since) return true;
    return false;
};

const hashAt = function (this: HashList, position: number): object | undefined {
    const found = this[listState];
    const { bucket, hash } = found;
    const record = bucket * hash.stride;
    if (bucket < 0 || !(position >= 0 && position < hash.records[record + recordLength])) return undefined;
    // On the world's thread, a bucket a change left unsorted is sorted by the first read by position.
    if (hash.unsorted !== 0 && isHashTable(hash) && hash.tails[bucket] >= 0) sortBucket(hash, bucket);
    const at =(hash.records[record + recordStart] + position) * entryWords;
    return rowAt(found.lookup, found.pool, position, hash.entries[at + 1], hash.entries[at + 2]);
};

const createFound = (lookup: IndexLookup, hash: HashView): Found => ({ bucket: -1, lookup, hash, pool: poolOf(lookup) });

const createList = (found: Found): List => shareList(found, hashLength, hashChanged, hashAt);

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

/**
 * Statements encoding argument `a${k}` into the key's words where it goes, each word into a constant `w${word}`: a
 * scalar of one word directly, the rest through the key's array.
 */
const encodeStatement = (parts: readonly KeyPart[]) => ({ part, scalar, word }: Destination, k: number): string => {
    switch (scalar) {
        case "i32": return `const w${word} = ((a${k} | 0) ^ 0x80000000) >>> 0;`;
        case "u32": return `const w${word} = a${k} >>> 0;`;
        case "f32": return `f32[0] = a${k}; const w${word} = orderF32(u32[0]);`;
        case "f64": return `f64[0] = a${k}; orderF64(u32[1], u32[0], key, ${word}); const w${word} = key[${word}], w${word + 1} = key[${word + 1}];`;
        case "boolean": return `u8[0] = a${k}; const w${word} = u8[0] === 0 ? 0 : 1;`;
        default: {
            const words = Array.from({ length: partWords(parts[part]) }, (_, w) => `w${word + w} = key[${word + w}]`);
            return `encodeValue(parts[${part}], a${k}, key, ${word});${words.length === 0 ? "" : ` const ${words.join(", ")};`}`;
        }
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
const generatedFind = (lookup: IndexLookup, hash: HashView, shape: Shape, list: List, found: Found): ((...values: unknown[]) => unknown) | null => {
    const { index } = lookup;
    const destinations = destinationsOf(index.parts, shape);
    if (!generating || destinations === null) return null;
    const { words } = index;
    const parameters = destinations.map((_, k) => `a${k}`);
    const same = Array.from({ length: words }, (_, w) => ` && records[base + ${recordKey + w}] === w${w}`).join("");
    const body = [
        `return (${parameters.join(", ")}) => {`,
        ...destinations.map(encodeStatement(index.parts)),
        "let h = 0x811C9DC5;",
        ...Array.from({ length: words }, (_, w) => `h = Math.imul(h ^ w${w}, 0x9E3779B1); h ^= h >>> 15;`),
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
            "const archetypeId = table.entries[at + 1], archetype = archetypeAt(archetypeId), row = pool.rows[0];",
            "if (row === undefined || archetype === undefined || pool.archetypes[0] !== archetypeId || pool.versions[0] !== archetype.version) return rowAt(lookup, pool, 0, archetypeId, table.entries[at + 2]);",
            "row.index = table.entries[at + 2];",
            "return row.value;",
        ] : [
            "found.bucket = bucket;",
            `if (bucket >= 0 && records[bucket * ${hash.stride} + ${recordLength}] > pool.ahead) growPool(lookup, pool, records[bucket * ${hash.stride} + ${recordLength}], table.entries[records[bucket * ${hash.stride} + ${recordStart}] * ${entryWords} + 1]);`,
            "return list;",
        ],
        "};",
    ].join("\n");
    try {
        const factory = new Function("key", "table", "found", "list", "pool", "lookup", "rowAt", "growPool", "encodeValue", "parts", "orderF32", "orderF64", "f32", "f64", "u32", "u8", "archetypeAt", body);
        // The factory returns the function its body above makes.
        const made: (...values: unknown[]) => unknown = factory(new Uint32Array(Math.max(1, words)), hash, found, list, found.pool, lookup, rowAt, growPool, encodeValue, index.parts, orderF32, orderF64, f32, f64, u32, u8, lookup.archetypeAt);
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
const createHashSite = (lookup: IndexLookup, hash: HashView, shape: Shape): Site => {
    const { index, unique } = lookup;
    const key = keyOf(lookup);
    const found = createFound(lookup, hash);
    const list = createList(found);
    const { pool } = found;
    const generated = generatedFind(lookup, hash, shape, list, found);
    if (generated !== null) return { find: generated };
    const { parts, words } = index;
    const forms = shape.map(form => typeof form === "number" ? form : 0);
    return {
        find: (...values) => {
            let next = 0;
            for (let p = 0; p < parts.length; p++) next = encodePart(parts[p], forms[p] ?? 0, values, next, key);
            const bucket = found.bucket = findBucket(hash, key, 0, hashWords(key, 0, words));
            if (!unique) {
                if (bucket >= 0 && lengthOf(hash, bucket) > pool.ahead) growPool(lookup, pool, lengthOf(hash, bucket), hash.entries[startOf(hash, bucket) * entryWords + 1]);
                return list;
            }
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

/**
 * What a sorted index's list holds: its range, its cursor, and what it reads; the rows of its last `madeAhead`
 * positions past its first ones in `tail`, by their distance from its end, so a list read from its end, highest
 * first, has its rows made ahead too.
 */
type Sorted = { readonly lookup: IndexLookup; readonly sorted: SortedView; readonly range: Range; readonly cursor: Cursor; readonly pool: Pool; readonly tail: Pool };
type SortedList = { readonly [listState]: Sorted };

/** Whether a tree's ticks over the blocks around positions `low` to `high` are newer than `since`. */
const newer = (sorted: SortedView, tree: Float64Array, low: number, high: number, since: number): boolean => {
    // The whole index: the tree's root.
    if (low <= 0 && high >= sorted.size) return tree[1] > since;
    const last = sorted.size - 1;
    return treeMaximum(sorted, tree, blockAt(sorted, Math.min(last, Math.max(low - 1, 0))), blockAt(sorted, Math.min(last, high))) > since;
};

const runChanged = (lookup: IndexLookup, sorted: SortedView, low: number, high: number, since: number): boolean => {
    if (newer(sorted, sorted.tree, low, high, since)) return true;
    const { watched } = lookup;
    for (let k = 0; k < watched.length; k++) {
        const watch = sorted.watched.get(watched[k]);
        if (watch === undefined || newer(sorted, watch.tree, low, high, since)) return true;
    }
    return false;
};

const sortedLength = function (this: SortedList): number {
    const { range } = this[listState];
    return range.high - range.low + range.end - range.second;
};

const sortedChanged = function (this: SortedList): boolean {
    const { lookup, sorted, range } = this[listState];
    const since = lookup.since.value;
    if (sorted.blocks === 0) return sorted.cleared > since;
    return runChanged(lookup, sorted, range.low, range.high, since) || (range.end > range.second && runChanged(lookup, sorted, range.second, range.end, since));
};

const sortedAt = function (this: SortedList, index: number): object | undefined {
    const state = this[listState];
    const { sorted, range, cursor } = state;
    const first = range.high - range.low;
    const length = first + range.end - range.second;
    if (!(index >= 0 && index < length)) return undefined;
    const position = index < first ? range.low + index : range.second + index - first;
    if (!(position >= cursor.first && position < cursor.first + cursor.length)) {
        cursor.k = blockAt(sorted, position);
        cursor.first = firstPosition(sorted, cursor.k);
        cursor.length = sorted.lengths[sorted.order[cursor.k]];
    }
    const base = blockBase(sorted, sorted.order[cursor.k]) + (position - cursor.first) * sorted.stride;
    const archetypeId = sorted.entries[base + sorted.words + 1];
    const row = sorted.entries[base + sorted.words + 2];
    if (index < madeAhead || length - index > madeAhead) return rowAt(state.lookup, state.pool, index, archetypeId, row);
    return rowAt(state.lookup, state.tail, length - 1 - index, archetypeId, row);
};

/** A list of a sorted index's rows, in key order, then entity order. */
const createSortedList = (lookup: IndexLookup, sorted: SortedView, range: Range, cursor: Cursor, pool: Pool, tail: Pool): List =>
    shareList<Sorted>({ lookup, sorted, range, cursor, pool, tail }, sortedLength, sortedChanged, sortedAt);

/** Whether a value a lookup was given for a sorted part is a comparison: a sorted part's own values are never plain objects. */
const isComparison = (value: unknown): value is { readonly [operator: string]: unknown } => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A site's lookup of a sorted index: a prefix of the key, whose last part may be a comparison, giving the rows in key
 * order; for a unique index, a whole key of plain values gives the row or null.
 */
const createSortedSite = (lookup: IndexLookup, sorted: SortedView, shape: Shape): Site => {
    const { index, unique } = lookup;
    const { parts } = index;
    const probe = keyOf(lookup);
    const objects: unknown[] = new Array<unknown>(parts.length).fill(undefined);
    const range: Range = { low: 0, high: 0, second: 0, end: 0 };
    const cursor: Cursor = { k: 0, first: 0, length: 0 };
    const pool = poolOf(lookup);
    const tail = poolOf(lookup);
    const list = createSortedList(lookup, sorted, range, cursor, pool, tail);
    /** The list, its pools grown first when it's longer than any before, bound to the archetype of its last entry. */
    const listed = (): List => {
        const length = range.high - range.low + range.end - range.second;
        if (length > pool.ahead && sorted.blocks > 0) {
            const last = sorted.order[sorted.blocks - 1];
            const archetypeId = sorted.entries[blockBase(sorted, last) + (sorted.lengths[last] - 1) * sorted.stride + sorted.words + 1];
            growPool(lookup, pool, length, archetypeId);
            if (length > madeAhead) growPool(lookup, tail, length - madeAhead, archetypeId);
        }
        return list;
    };
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
            return listed();
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
            if (!unique || given < parts.length) return listed();
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
        return listed();
    };
    // Without a key, or with none of it given: every row.
    if (shape.length === 0) {
        return {
            find: (): unknown => {
                cursor.length = 0;
                cursor.first = 0;
                range.low = 0;
                range.high = sorted.size;
                range.second = range.end = 0;
                return listed();
            },
        };
    }
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
 * The function a body calls for a lookup through an index: called with a key, as code the plugin didn't rewrite calls
 * it, it makes a new list each time; the plugin's call sites reuse their own (`prepared-lookup.ts`).
 */
export const lookupFunction = (lookup: IndexLookup): (...key: unknown[]) => unknown => {
    const call = (...key: unknown[]): unknown => createSite(lookup, wholeShape(key.length)).find(...key);
    lookups.set(call, lookup);
    return call;
};

/** A lookup through one of the world's indexes, for a main-thread body or finalizer. */
export const createIndexLookup = (state: State, index: IndexView, declared: { readonly read?: readonly Key[]; readonly changed?: readonly Key[] | true }, since: Since): (...key: unknown[]) => unknown => {
    const reads = declared.read ?? [];
    return lookupFunction({
        rows: state,
        archetypeAt: id => state.archetypes[id],
        index,
        unique: index.unique,
        reads,
        readIds: reads.map(key => idOf(state, key)),
        watched: watchedBy(declared).map(key => idOf(state, key)),
        since,
        replaced: state.replaced,
    });
};
