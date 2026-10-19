import type { Archetype } from './archetype.js';
import { encodeScalar, encodeValue, hashWords, type KeyPart } from './index-keys.js';
import { entryWords, findBucket } from './index-hash.js';
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
            return found.bucket < 0 ? 0 : hash.lengths[found.bucket];
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
            if (bucket < 0 || !(position >= 0 && position < hash.lengths[bucket])) return undefined;
            const at = (hash.starts[bucket] + position) * entryWords;
            return rowAt(lookup, pool, position, hash.entries[at + 1], hash.entries[at + 2]);
        },
    };
};

/** Words of the key a site encodes its arguments into. */
const keyOf = (lookup: IndexLookup): Uint32Array => new Uint32Array(Math.max(1, lookup.index.words));

/** Encodes a key part from a site's arguments starting at `next`, as its shape passes it; returns the next argument. */
const encodePart = (part: KeyPart, form: number, values: readonly unknown[], next: number, key: Uint32Array): number => {
    if (form === 0 || part.kind !== "leaves" || part.leaves.length !== form || part.leaves.some(leaf => leaf.path.length !== 1)) {
        // A literal the part's leaves don't take one scalar each from is rebuilt as the value it was.
        encodeValue(part, form === 0 ? values[next] : values.slice(next, next + form), key, part.first);
        return next + Math.max(1, form);
    }
    let word = part.first;
    for (let k = 0; k < form; k++) word = encodeScalar(part.leaves[k].scalar, values[next + k], key, word);
    return next + form;
};

/** One call site's lookup: its list, or for a unique index its row, reused each time it runs. */
export type Site = { readonly find: (values: readonly unknown[]) => unknown };

/** A site's lookup by `shape`: each argument a whole key part, of the index's parts in order. */
export const createSite = (lookup: IndexLookup, shape: Shape): Site => {
    const { index, unique } = lookup;
    const key = keyOf(lookup);
    const found: Found = { bucket: -1 };
    const list = createList(lookup, found);
    const pool: Pool = { rows: [], archetypes: [], versions: [] };
    const { parts, words, hash } = index;
    const forms = shape.map(form => typeof form === "number" ? form : 0);
    return {
        find: values => {
            let next = 0;
            for (let p = 0; p < parts.length; p++) next = encodePart(parts[p], forms[p] ?? 0, values, next, key);
            found.bucket = findBucket(hash, key, 0, hashWords(key, 0, words));
            if (!unique) return list;
            const { bucket } = found;
            if (bucket < 0 || hash.lengths[bucket] === 0) return null;
            const at = hash.starts[bucket] * entryWords;
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
    const call = (...key: unknown[]): unknown => createSite(lookup, wholeShape(key.length)).find(key);
    lookups.set(call, lookup);
    return call;
};
