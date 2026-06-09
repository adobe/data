// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Entity } from "../../entity/entity.js";
import { compare } from "../../../functions/compare.js";

// ============================================================================
// Declaration shape (mirrors `Index` in store/index-types.ts at the value layer)
// ============================================================================

/**
 * `key` declaration variants. See `Index` in `store/index-types.ts` for
 * the type-level mirror that drives `find` / `get` argument inference.
 */
export type IndexKeyDecl =
    | string                                           // bare column name → sugar for [column]
    | readonly string[]                                // column tuple → object find
    | { readonly [slot: string]: string | ((components: Record<string, unknown>) => unknown) };  // slot map (computed keys take a named component object)

/** `order` declaration: read columns + optional comparator. */
export type IndexOrderDecl = {
    readonly by: readonly string[];
    readonly compare?: (a: any, b: any) => number;
};

/**
 * The shape a user (or higher layer) hands to `createIndex` for a single
 * index. Mirrors the public `Index` type but loose-typed at this layer
 * because the runtime doesn't have access to the host component map.
 */
export interface IndexState {
    readonly key: IndexKeyDecl;
    readonly order?: IndexOrderDecl;
    readonly unique?: boolean;
    /**
     * Columns extractor functions read. Only required when at least one
     * function in `key` reads from a column not already covered by a
     * string identity in `key` or `order.by`.
     */
    readonly components?: readonly string[];
    /**
     * When the index is scoped to an archetype, the archetype's full component
     * set. An entity is included only if it has *every* one of these columns
     * (superset match), and seeding walks only archetypes that carry them — so
     * the index covers that archetype (and supersets), not every entity that
     * merely shares the key column.
     */
    readonly scopeColumns?: readonly string[];
}

// ============================================================================
// Key serialization
// ============================================================================

/**
 * Stable string serialization for a bucket key. Objects are key-sorted
 * so `{a, b}` and `{b, a}` produce the same key. Used for the Map<string,
 * Entity[]> bucket store.
 */
const serializeKey = (value: unknown): string => {
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map(serializeKey).join(",")}]`;
    }
    const keys = Object.keys(value as object).sort();
    let out = "{";
    for (let i = 0; i < keys.length; i++) {
        if (i > 0) out += ",";
        const k = keys[i];
        out += JSON.stringify(k) + ":" + serializeKey((value as any)[k]);
    }
    out += "}";
    return out;
};

/**
 * Fan-out: given a single raw key value (scalar / array / object with
 * possibly-array slots), produce every bucket key value the entity should
 * be filed under. Array at top level → one entry per element. Object
 * with array-valued slots → cartesian product across them.
 */
const expandBucketKeys = (keyValue: unknown): unknown[] => {
    if (Array.isArray(keyValue)) return keyValue.length === 0 ? [] : keyValue;
    if (keyValue !== null && typeof keyValue === "object") {
        const entries = Object.entries(keyValue as Record<string, unknown>);
        let acc: Record<string, unknown>[] = [{}];
        for (const [k, v] of entries) {
            const choices = Array.isArray(v) ? v : [v];
            if (choices.length === 0) return [];
            const next: Record<string, unknown>[] = [];
            for (const partial of acc) {
                for (const choice of choices) {
                    next.push({ ...partial, [k]: choice });
                }
            }
            acc = next;
        }
        return acc;
    }
    return [keyValue];
};

// ============================================================================
// Key normalization
// ============================================================================

/**
 * Compiled form of a `key` declaration. Produces the bucket-key value(s)
 * for an entity at insert/update time, and the lookup-key value for a
 * find/get argument.
 */
interface KeyExtractor {
    /** Columns the extractor reads from entity values. */
    readonly readColumns: readonly string[];
    /** Returns the raw bucket key value for an entity (pre-fan-out). null = skip. */
    extractFromEntity(values: Readonly<Record<string, unknown>>): unknown | null;
    /** Returns the lookup key value for a find/get arg. */
    extractFromLookup(arg: unknown): unknown;
}

const normalizeKey = (
    keyDecl: IndexKeyDecl,
    extraComponents: readonly string[],
): KeyExtractor => {
    // A bare column name is sugar for the single-column tuple `[col]`: the
    // bucket key and the lookup arg are both the named object `{ col: value }`,
    // so there is no scalar form to special-case below.
    const decl = typeof keyDecl === "string" ? [keyDecl] : keyDecl;
    // String tuple
    if (Array.isArray(decl)) {
        const cols = decl as readonly string[];
        return {
            readColumns: cols,
            extractFromEntity: (values) => {
                const out: Record<string, unknown> = {};
                for (const c of cols) {
                    const v = values[c];
                    if (v === undefined) return null;
                    out[c] = v;
                }
                return out;
            },
            extractFromLookup: (arg) => arg,
        };
    }
    // Slot map
    type SlotExtractor = (components: Record<string, unknown>) => unknown;
    const slotEntries = Object.entries(decl as Record<string, string | SlotExtractor>);
    // Read set: identity-string columns + extra components for functions.
    const reads = new Set<string>();
    for (const [, v] of slotEntries) if (typeof v === "string") reads.add(v);
    for (const c of extraComponents) reads.add(c);
    return {
        readColumns: [...reads],
        extractFromEntity: (values) => {
            // Computed slots receive a single named object of the index's
            // declared `components` (not positional args), so an extractor
            // reads `c.email` rather than relying on argument order.
            let componentValues: Record<string, unknown> | null = null;
            const componentObject = (): Record<string, unknown> | null => {
                if (componentValues) return componentValues;
                const obj: Record<string, unknown> = {};
                for (const c of extraComponents) {
                    const cv = values[c];
                    if (cv === undefined) return null;
                    obj[c] = cv;
                }
                return (componentValues = obj);
            };
            const out: Record<string, unknown> = {};
            for (const [slot, ext] of slotEntries) {
                if (typeof ext === "string") {
                    const v = values[ext];
                    if (v === undefined) return null;
                    out[slot] = v;
                } else {
                    const components = componentObject();
                    if (components === null) return null;
                    const v = (ext as SlotExtractor)(components);
                    if (v === undefined) return null;
                    out[slot] = v;
                }
            }
            return out;
        },
        extractFromLookup: (arg) => arg,
    };
};

// ============================================================================
// Order normalization
// ============================================================================

interface OrderExtractor {
    readonly readColumns: readonly string[];
    /** Snapshot per-entity sort tuple. */
    snapshot(values: Readonly<Record<string, unknown>>): Record<string, unknown> | null;
    /** Comparator over the snapshots. */
    compare(a: Record<string, unknown>, b: Record<string, unknown>): number;
}

const defaultCompare = (
    by: readonly string[],
): ((a: Record<string, unknown>, b: Record<string, unknown>) => number) =>
    (a, b) => {
        for (const c of by) {
            const cmp = compare(a[c] as any, b[c] as any);
            if (cmp !== 0) return cmp;
        }
        return 0;
    };

const normalizeOrder = (order: IndexOrderDecl): OrderExtractor => {
    const { by, compare } = order;
    const cmp = compare ?? defaultCompare(by);
    return {
        readColumns: by,
        snapshot: (values) => {
            const out: Record<string, unknown> = {};
            for (const c of by) {
                const v = values[c];
                if (v === undefined) return null;
                out[c] = v;
            }
            return out;
        },
        compare: cmp,
    };
};

// ============================================================================
// RuntimeIndex
// ============================================================================

/**
 * Runtime instance of a single declared index. Public methods mirror
 * `Index.Handle` in `store/index-types.ts`.
 */
export interface RuntimeIndex {
    readonly unique: boolean;
    /** Columns the index reads from entities, for the store-layer seed path. */
    readonly readColumns: readonly string[];
    /** Whether this index is sorted (`order` was declared). */
    readonly sorted: boolean;
    /** Underlying key declaration — exposed for the auto-router and dedup. */
    readonly key: IndexKeyDecl;
    /** Underlying order declaration, if any. */
    readonly order: IndexOrderDecl | undefined;

    add(entity: Entity, values: Readonly<Record<string, unknown>>): void;
    remove(entity: Entity): void;
    update(entity: Entity, values: Readonly<Record<string, unknown>>): void;
    clear(): void;
    readonly size: number;

    find(arg: unknown): readonly Entity[];
    findRange(arg: unknown): readonly Entity[];
    get(arg: unknown): Entity | null;

    /**
     * For unique indexes: returns the existing entity holding any bucket
     * key the new `values` would land in (excluding `excludeEntity` if
     * provided), or null. Used by the Store-layer pre-check so unique
     * conflicts throw before the column mutation.
     */
    checkUniqueAvailable(
        values: Readonly<Record<string, unknown>>,
        excludeEntity: Entity | null,
    ): Entity | null;
}

export const createIndex = (state: IndexState): RuntimeIndex => {
    const unique = state.unique ?? false;
    const extraComponents = state.components ?? [];
    const scopeColumns = state.scopeColumns ?? [];
    const keyEx = normalizeKey(state.key, extraComponents);
    const orderEx = state.order ? normalizeOrder(state.order) : null;
    const sorted = orderEx !== null;

    // All columns the index touches (key reads + sort reads + archetype-scope
    // columns). Used by the store to walk only relevant archetypes when
    // seeding — folding in scopeColumns restricts seeding to the scoped
    // archetype (and supersets).
    const readColumns = (() => {
        const set = new Set<string>(keyEx.readColumns);
        if (orderEx) for (const c of orderEx.readColumns) set.add(c);
        for (const c of scopeColumns) set.add(c);
        return [...set];
    })();

    // Bucket payload:
    //  - non-unique → Set<Entity>  (membership; O(1) add + delete + has)
    //  - unique     → single Entity
    // We use a Set rather than an Entity[] so single-entity writes are
    // O(1) in bucket size — `arr.indexOf` + `splice` / `swap-pop` would
    // make remove and bucket-change updates O(bucket.size), which can be
    // O(archetype.rowCount) in pathological cases (many entities sharing
    // one bucket key).
    const buckets = new Map<string, Entity | Set<Entity>>();
    // The post-fan-out key value for each serialized bucket key. `findRange`
    // reads this to apply per-bucket operator filters (find scans every
    // bucket once and keeps the ones whose value matches the filter).
    const bucketValueByKey = new Map<string, unknown>();
    // Reverse map: which serialized bucket keys each entity sits in.
    const entityKeys = new Map<Entity, string[]>();
    // Sort cache, if sorted.
    const sortCache: Map<Entity, Record<string, unknown>> = sorted ? new Map() : (undefined as never);
    // Cached sorted array per bucket — populated lazily by `find` /
    // `findRange`, dropped on any write that touches the bucket. Lets
    // repeated reads of the same bucket avoid re-materializing + re-sorting.
    const sortedCache: Map<string, Entity[]> = sorted ? new Map() : (undefined as never);

    // Helpers ---------------------------------------------------------------

    /** Enumerate (serialized-key, post-fan-out-value) pairs for an entity. */
    const bucketEntriesFor = (
        values: Readonly<Record<string, unknown>>,
    ): { key: string; value: unknown }[] => {
        // No per-entity scope check here: archetype scope is enforced upstream
        // by the registry's archetype-keyed dispatch (an index is only invoked
        // for archetypes whose components are a superset of its `readColumns`,
        // which includes the scope columns), so any entity reaching this point
        // is already in scope.
        const raw = keyEx.extractFromEntity(values);
        if (raw === null) return [];
        const expanded = expandBucketKeys(raw);
        const out: { key: string; value: unknown }[] = [];
        const seen = new Set<string>();
        for (const v of expanded) {
            const s = serializeKey(v);
            if (!seen.has(s)) {
                seen.add(s);
                out.push({ key: s, value: v });
            }
        }
        return out;
    };

    /** Just the keys (used in many maintenance paths). */
    const bucketKeysFor = (values: Readonly<Record<string, unknown>>): string[] =>
        bucketEntriesFor(values).map((e) => e.key);

    const lookupKey = (arg: unknown): string => serializeKey(keyEx.extractFromLookup(arg));

    /** Comparator that reads each entity's snapshot from sortCache. */
    const compareEntities = (a: Entity, b: Entity): number =>
        orderEx!.compare(sortCache.get(a)!, sortCache.get(b)!);

    /**
     * Materialize a non-unique bucket as an `Entity[]`. For sorted indexes
     * the result is cached and the cache is invalidated by writes — so
     * repeated reads of the same bucket pay nothing after the first.
     */
    const materializeBucket = (key: string, set: Set<Entity>): Entity[] => {
        if (sorted) {
            const cached = sortedCache.get(key);
            if (cached !== undefined) return cached;
            const arr = [...set];
            if (arr.length > 1) arr.sort(compareEntities);
            sortedCache.set(key, arr);
            return arr;
        }
        return [...set];
    };

    const insertIntoBucket = (entity: Entity, key: string, value: unknown): void => {
        bucketValueByKey.set(key, value);
        if (unique) {
            const existing = buckets.get(key);
            if (existing !== undefined && existing !== entity) {
                throw new Error(
                    `Unique index conflict on key ${key}: ` +
                    `existing entity ${existing}, new entity ${entity}`,
                );
            }
            buckets.set(key, entity);
            return;
        }
        let set = buckets.get(key) as Set<Entity> | undefined;
        if (!set) buckets.set(key, (set = new Set()));
        set.add(entity);
        if (sorted) sortedCache.delete(key);
    };

    const removeFromBucket = (entity: Entity, key: string): void => {
        if (unique) {
            buckets.delete(key);
            bucketValueByKey.delete(key);
            return;
        }
        const set = buckets.get(key) as Set<Entity> | undefined;
        if (!set) return;
        set.delete(entity);
        if (sorted) sortedCache.delete(key);
        if (set.size === 0) {
            buckets.delete(key);
            bucketValueByKey.delete(key);
        }
    };

    // Public methods --------------------------------------------------------

    const add = (entity: Entity, values: Readonly<Record<string, unknown>>): void => {
        const entries = bucketEntriesFor(values);
        if (entries.length === 0) return;
        if (unique) {
            for (const { key } of entries) {
                const existing = buckets.get(key);
                if (existing !== undefined && existing !== entity) {
                    throw new Error(
                        `Unique index conflict on key ${key}: ` +
                        `existing entity ${existing}, new entity ${entity}`,
                    );
                }
            }
        }
        if (sorted) {
            const snap = orderEx!.snapshot(values);
            if (snap === null) return;
            sortCache.set(entity, snap);
        }
        for (const { key, value } of entries) insertIntoBucket(entity, key, value);
        entityKeys.set(entity, entries.map((e) => e.key));
    };

    const remove = (entity: Entity): void => {
        const keys = entityKeys.get(entity);
        if (!keys) return;
        for (const k of keys) removeFromBucket(entity, k);
        entityKeys.delete(entity);
        if (sorted) sortCache.delete(entity);
    };

    const update = (entity: Entity, values: Readonly<Record<string, unknown>>): void => {
        const nextEntries = bucketEntriesFor(values);
        const nextKeys = nextEntries.map((e) => e.key);
        const prevKeys = entityKeys.get(entity) ?? [];
        const nextSet = new Set(nextKeys);
        const prevSet = new Set(prevKeys);

        // Unique pre-check on new keys we don't already own.
        if (unique) {
            for (const k of nextKeys) {
                if (prevSet.has(k)) continue;
                const existing = buckets.get(k);
                if (existing !== undefined && existing !== entity) {
                    throw new Error(
                        `Unique index conflict on key ${k}: ` +
                        `existing entity ${existing}, new entity ${entity}`,
                    );
                }
            }
        }

        // Same bucket set → only the per-entity sort snapshot may have
        // changed. Refresh it and drop the sort cache so the next read
        // re-sorts. No bucket scan up front — O(b) total.
        const sameBuckets = nextKeys.length === prevKeys.length &&
            nextKeys.every((k, i) => k === prevKeys[i]);
        if (sameBuckets) {
            if (!sorted) return;
            const newSnap = orderEx!.snapshot(values);
            if (newSnap === null) { remove(entity); return; }
            const oldSnap = sortCache.get(entity);
            if (oldSnap !== undefined && orderEx!.compare(oldSnap, newSnap) === 0) return;
            sortCache.set(entity, newSnap);
            if (!unique) for (const k of nextKeys) sortedCache.delete(k);
            return;
        }

        // Bucket-set changed: drop the ones we left, refresh sort cache,
        // insert into the new ones. insertIntoBucket marks new buckets dirty.
        for (const k of prevKeys) if (!nextSet.has(k)) removeFromBucket(entity, k);
        if (sorted) {
            if (nextEntries.length === 0) sortCache.delete(entity);
            else {
                const snap = orderEx!.snapshot(values);
                if (snap === null) { remove(entity); return; }
                sortCache.set(entity, snap);
            }
        }
        for (const { key, value } of nextEntries) {
            if (!prevSet.has(key)) insertIntoBucket(entity, key, value);
        }
        if (nextKeys.length === 0) entityKeys.delete(entity);
        else entityKeys.set(entity, nextKeys);
    };

    const clear = (): void => {
        buckets.clear();
        bucketValueByKey.clear();
        entityKeys.clear();
        if (sorted) {
            sortCache.clear();
            sortedCache.clear();
        }
    };

    const find = (arg: unknown): readonly Entity[] => {
        const k = lookupKey(arg);
        const bucket = buckets.get(k);
        if (bucket === undefined) return [];
        if (unique) return [bucket as Entity];
        // Materialize a fresh array on each call to keep the returned
        // result independent of internal mutations. For sorted indexes
        // the inner sorted array is cached and reused across reads until
        // the next write to the bucket — so successive reads only pay
        // the slice, not the sort.
        return materializeBucket(k, bucket as Set<Entity>).slice();
    };

    // findRange supports the exact-match argument shape that `find` accepts,
    // plus operator filters on the bucket key. Operators are
    // ==, !=, <, <=, >, >=. For a scalar key (bare-string or function key),
    // an operator object at the argument root applies to the scalar value.
    // For an object key (tuple or slot map), each field can be either a
    // value (equality) or an operator object.
    //
    // Implementation walks every bucket once. That cost is linear in the
    // bucket count, but the alternative — maintaining a sorted index on the
    // bucket key — is much heavier machinery for the same result on most
    // workloads. The hot path for users is `find`, not `findRange`.
    const isOperatorObject = (v: unknown): boolean => {
        if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
        const keys = Object.keys(v as object);
        if (keys.length === 0) return false;
        for (const k of keys) {
            if (k !== "==" && k !== "!=" && k !== "<" && k !== "<=" && k !== ">" && k !== ">=") {
                return false;
            }
        }
        return true;
    };

    const matchesOps = (value: unknown, ops: Record<string, unknown>): boolean => {
        for (const op in ops) {
            const target = ops[op];
            const v = value as any;
            const t = target as any;
            switch (op) {
                case "==": if (!Object.is(v, t)) return false; break;
                case "!=": if (Object.is(v, t)) return false; break;
                case "<":  if (!(v <  t)) return false; break;
                case "<=": if (!(v <= t)) return false; break;
                case ">":  if (!(v >  t)) return false; break;
                case ">=": if (!(v >= t)) return false; break;
            }
        }
        return true;
    };

    // Every index key is object-shaped (a single column is sugar for a
    // one-field object), so a `findRange` arg is always matched per field.
    const matchesArg = (bucketValue: unknown, arg: unknown): boolean => {
        if (arg === null || typeof arg !== "object" || Array.isArray(arg)) return false;
        for (const field in arg as Record<string, unknown>) {
            const condition = (arg as Record<string, unknown>)[field];
            const fieldValue = (bucketValue as Record<string, unknown>)[field];
            if (isOperatorObject(condition)) {
                if (!matchesOps(fieldValue, condition as Record<string, unknown>)) return false;
            } else if (!Object.is(fieldValue, condition)) {
                return false;
            }
        }
        return true;
    };

    const findRange = (arg: unknown): readonly Entity[] => {
        const result = new Set<Entity>();
        for (const [key, bucketEntries] of buckets) {
            const bucketValue = bucketValueByKey.get(key);
            if (!matchesArg(bucketValue, arg)) continue;
            if (unique) { result.add(bucketEntries as Entity); continue; }
            // For sorted indexes, materialize the (cached) sorted array
            // so per-bucket order is consistent with `find` semantics.
            // Cross-bucket order is still arbitrary (the outer Set).
            const set = bucketEntries as Set<Entity>;
            const ordered = sorted ? materializeBucket(key, set) : set;
            for (const e of ordered) result.add(e);
        }
        return [...result];
    };

    const get = (arg: unknown): Entity | null => {
        if (!unique) {
            throw new Error("Database.Index.Handle.get is only available on unique indexes");
        }
        const k = lookupKey(arg);
        const bucket = buckets.get(k);
        return bucket === undefined ? null : (bucket as Entity);
    };

    const checkUniqueAvailable = (
        values: Readonly<Record<string, unknown>>,
        excludeEntity: Entity | null,
    ): Entity | null => {
        if (!unique) return null;
        const keys = bucketKeysFor(values);
        for (const k of keys) {
            const existing = buckets.get(k);
            if (existing === undefined) continue;
            if (excludeEntity !== null && existing === excludeEntity) continue;
            return existing as Entity;
        }
        return null;
    };

    return {
        unique,
        readColumns,
        sorted,
        key: state.key,
        order: state.order,
        add,
        remove,
        update,
        clear,
        get size() { return entityKeys.size; },
        find,
        findRange,
        get: get as RuntimeIndex["get"],
        checkUniqueAvailable,
    };
};
