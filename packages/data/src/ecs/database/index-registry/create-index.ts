// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Entity } from "../../entity/entity.js";
import { Filter, getRowPredicateFromFilter } from "../../../table/select-rows.js";

const KEY_SEPARATOR = "\x1f"; // ASCII unit separator — not a valid char in JSON output

export interface IndexState {
    /** Ordered list of component keys participating in the index. */
    readonly components: readonly string[];
    /** When true, at most one entity per key tuple. */
    readonly unique: boolean;
    /**
     * Optional pure function: when present, the bucket key is the value
     * this returns (the "derived key"), called with the entity's
     * component values positionally in `components` order. When absent,
     * the bucket key is the components tuple itself (raw index).
     */
    readonly compute?: (...args: unknown[]) => unknown;
    /**
     * Optional within-bucket sort order. Keys are component names on
     * the indexed entity, values are direction booleans (`true` = asc,
     * `false` = desc). Insertion order of keys defines precedence.
     */
    readonly order?: { readonly [name: string]: boolean };
}

/**
 * Runtime instance of a single declared index. Owns the bucket maps and
 * exposes the same lookup methods that the type-level `Database.Index.Handle`
 * advertises (find/findRange/get for unique).
 *
 * Two flavours share this object — distinguished by `compute` being set or
 * not. For raw indexes the lookup methods take a `Record<componentKey,
 * value>` shape; for computed indexes they take the derived key value
 * directly. The runtime branches on `compute` to choose the right code
 * path. The static `Database.Index.Handle` type expresses this dispatch.
 *
 * **Array (multi-value) fan-out** is automatic. Any indexed value that
 * arrives as an array — a component column declared `T[]`, or a `compute`
 * return value — fans out into one bucket entry per element. Raw indexes
 * with multiple array-valued components fan out across the cartesian
 * product. The reverse map (`entityKeys`) stores the list of bucket keys
 * the entity currently sits in, so `update` / `remove` cleanly visit all
 * of them.
 *
 * Maintenance is incremental: `add` / `remove` / `update` are called from
 * the registry as mutations happen.
 *
 * Pre-check helpers (`checkUniqueAvailable`, `checkUniqueAvailableForUpdate`)
 * exist so the Store can detect a unique-key collision *before* mutating the
 * column store, keeping store and index consistent even when the user's
 * transaction body re-throws between mutations.
 */
export interface RuntimeIndex extends IndexState {
    /**
     * `values` is the entity's full component record (post-mutation). The
     * runtime extracts only the indexed components, then either uses them
     * directly as the key (raw) or feeds them to `compute` to derive one
     * (computed). When any indexed component is missing from `values`,
     * the entity is silently skipped (it can't be in this index). When
     * any indexed value is an array, the entity is registered into one
     * bucket per element (cartesian product for raw multi-component).
     */
    add(entity: Entity, values: Readonly<Record<string, unknown>>): void;
    remove(entity: Entity): void;
    update(entity: Entity, values: Readonly<Record<string, unknown>>): void;
    clear(): void;
    readonly size: number;
    /**
     * `arg` shape depends on `compute`:
     * - Raw: `Record<componentKey, value>` — element form per component
     *   (a single element when the underlying column is `T[]`).
     * - Computed: the derived key value directly (element form when the
     *   compute return is `T[]`).
     */
    find(arg: unknown): readonly Entity[];
    /**
     * `arg` shape depends on `compute`:
     * - Raw: a `Filter<Record<componentKey, value>>`.
     * - Computed: a `WhereCondition<Key>` — either the key directly
     *   (acts like find) or a single `ComparisonOperation<Key>`.
     */
    findRange(arg: unknown): readonly Entity[];
    /** Throws if `unique` is false. The type system also prevents this at the call site. */
    get(arg: unknown): Entity | undefined;
    /**
     * For unique indexes only — non-unique indexes return `null` without
     * doing any work. Returns `null` when none of the (potentially-new)
     * keys derived from `values` collide with an existing entry; returns
     * the colliding existing entity when any does. Callers should throw
     * on a non-null return *before* performing any mutation.
     */
    checkUniqueAvailable(values: Readonly<Record<string, unknown>>): Entity | null;
    /**
     * Like `checkUniqueAvailable` but for updates — `excludeEntity` is the
     * entity currently being updated; a collision with itself is not a
     * conflict. `values` must reflect the post-update state (caller is
     * responsible for merging the patch with the entity's current values).
     */
    checkUniqueAvailableForUpdate(
        excludeEntity: Entity,
        values: Readonly<Record<string, unknown>>,
    ): Entity | null;
}

const COMPARISON_OPS = ["==", "!=", "<", "<=", ">", ">="] as const;
type ComparisonOp = typeof COMPARISON_OPS[number];

/** Returns true when `range` is an object holding at least one operator key. */
const isOperatorObject = (range: unknown): range is Partial<Record<ComparisonOp, unknown>> => {
    if (range === null || typeof range !== "object") return false;
    for (const op of COMPARISON_OPS) {
        if (op in (range as object)) return true;
    }
    return false;
};

const matchesOperators = (value: unknown, ops: Partial<Record<ComparisonOp, unknown>>): boolean => {
    for (const op of COMPARISON_OPS) {
        if (!(op in ops)) continue;
        const v = ops[op];
        switch (op) {
            case "==": if (!(value === v)) return false; break;
            case "!=": if (!(value !== v)) return false; break;
            case "<":  if (!((value as any) <  (v as any))) return false; break;
            case "<=": if (!((value as any) <= (v as any))) return false; break;
            case ">":  if (!((value as any) >  (v as any))) return false; break;
            case ">=": if (!((value as any) >= (v as any))) return false; break;
        }
    }
    return true;
};

/**
 * One bucket entry an entity should be filed into. For raw indexes
 * `rawValues` is the per-component values of this specific entry (after
 * any array fan-out); for computed indexes `derived` is the single
 * derived key value (the element after fan-out, if applicable).
 */
interface BucketEntry {
    readonly key: string;
    readonly rawValues?: Record<string, unknown>;
    readonly derived?: unknown;
}

/**
 * Build a comparator from an `order` declaration. Selected ONCE at index
 * creation; the resulting closure is the hot-path comparator used by
 * binary insert and the bulk-load sort. Single-key declarations get a
 * specialized closure — same code shape as a hand-written comparator
 * over one key — so single-key indexes pay no overhead vs. a hypothetical
 * `order: "fractIndex"` string form.
 *
 * `sortCache` is `Map<Entity, unknown[]>` holding the sort tuple per
 * entity. The comparator looks up entities through it without going
 * back to the store.
 */
const buildComparator = (
    order: { readonly [name: string]: boolean },
    sortCache: Map<Entity, unknown[]>,
): ((a: Entity, b: Entity) => number) => {
    const keys = Object.keys(order);
    const directions = keys.map((k) => order[k] !== false); // true = asc, false = desc
    // The sort tuple stores `unknown` values — at the type level TS
    // can't know they're comparable. Cast to `any` at the comparison
    // sites: JS's `<` follows the user's chosen Key type's natural
    // ordering (string lexicographic, number numeric), same as
    // `select({ order })`'s subtraction-based comparator.
    if (keys.length === 1) {
        const asc = directions[0];
        return (a, b) => {
            const ta = sortCache.get(a)!;
            const tb = sortCache.get(b)!;
            const va = ta[0] as any; const vb = tb[0] as any;
            if (va === vb) return 0;
            if (va < vb) return asc ? -1 : 1;
            return asc ? 1 : -1;
        };
    }
    return (a, b) => {
        const ta = sortCache.get(a)!;
        const tb = sortCache.get(b)!;
        for (let i = 0; i < keys.length; i++) {
            const va = ta[i] as any; const vb = tb[i] as any;
            if (va === vb) continue;
            if (va < vb) return directions[i] ? -1 : 1;
            return directions[i] ? 1 : -1;
        }
        return 0;
    };
};

export const createIndex = (state: IndexState): RuntimeIndex => {
    const { components, unique, compute, order } = state;
    const isComputed = compute !== undefined;
    const isSorted = order !== undefined && Object.keys(order).length > 0;
    const orderKeys = isSorted ? Object.keys(order!) : [];
    // Sort-key cache, populated at insert and refreshed at update. Only
    // allocated when the index actually sorts.
    const sortCache: Map<Entity, unknown[]> = isSorted ? new Map() : (undefined as never);
    const comparator = isSorted ? buildComparator(order!, sortCache) : null;

    // Bucket payloads:
    //  - non-unique → `Entity[]`
    //  - unique     → single `Entity`
    const buckets = new Map<string, Entity | Entity[]>();
    // For raw indexes only: parsed component values per bucket, used by
    // findRange so we never re-parse the serialized key. After fan-out
    // each per-bucket entry holds element values (not the original
    // array).
    const bucketValues = new Map<string, Record<string, unknown>>();
    // For computed indexes only: the derived Key value per bucket. Used
    // by findRange to apply operator-based range queries against the
    // original (un-serialized) key value.
    const bucketKeyValue = new Map<string, unknown>();
    // Reverse map: which bucket keys each entity currently sits in.
    // With array fan-out an entity may appear in multiple buckets, so
    // this is an array — single-element for the scalar case (the common
    // path), longer for multi-value entries.
    const entityKeys = new Map<Entity, string[]>();

    /**
     * Enumerate every (key, rawValues) bucket entry an entity should be
     * filed into given its `values`. Cartesian product across any
     * array-valued indexed components. Returns null when any indexed
     * component is missing or any array is empty (entity isn't in this
     * index).
     */
    const rawBucketEntries = (
        values: Readonly<Record<string, unknown>>,
    ): BucketEntry[] | null => {
        // Per-component element lists (length 1 for scalars).
        const perComponent: Array<{ component: string; elements: unknown[] }> = [];
        for (const c of components) {
            const v = values[c];
            if (v === undefined) return null;
            if (Array.isArray(v)) {
                if (v.length === 0) return null;
                perComponent.push({ component: c, elements: v });
            } else {
                perComponent.push({ component: c, elements: [v] });
            }
        }
        const out: BucketEntry[] = [];
        const walk = (i: number, parts: string[], indexed: Record<string, unknown>): void => {
            if (i === perComponent.length) {
                out.push({ key: parts.join(KEY_SEPARATOR), rawValues: { ...indexed } });
                return;
            }
            const { component, elements } = perComponent[i];
            for (const el of elements) {
                parts.push(JSON.stringify(el));
                indexed[component] = el;
                walk(i + 1, parts, indexed);
                parts.pop();
                delete indexed[component];
            }
        };
        walk(0, [], {});
        return out;
    };

    /** Compute the bucket entries for a computed index (single or fanned-out). */
    const computedBucketEntries = (
        values: Readonly<Record<string, unknown>>,
    ): BucketEntry[] | null => {
        const args: unknown[] = [];
        for (const c of components) {
            const v = values[c];
            if (v === undefined) return null;
            args.push(v);
        }
        const result = compute!(...args);
        if (result === undefined) return null;
        if (Array.isArray(result)) {
            if (result.length === 0) return null;
            return result.map((el) => ({ key: JSON.stringify(el), derived: el }));
        }
        return [{ key: JSON.stringify(result), derived: result }];
    };

    const bucketEntriesFor = (
        values: Readonly<Record<string, unknown>>,
    ): BucketEntry[] | null => isComputed
        ? computedBucketEntries(values)
        : rawBucketEntries(values);

    /** Serialize a single lookup-arg element to its bucket key. */
    const serializeLookupKey = (value: unknown): string | null => {
        if (value === undefined) return null;
        return JSON.stringify(value);
    };

    /** Build the per-key string from a lookup-arg record (raw indexes). */
    const lookupKeyForRaw = (
        values: Readonly<Record<string, unknown>>,
    ): string | null => {
        const parts: string[] = [];
        for (const c of components) {
            const v = values[c];
            if (v === undefined) return null;
            parts.push(JSON.stringify(v));
        }
        return parts.join(KEY_SEPARATOR);
    };

    /**
     * Locate the insertion point in a sorted bucket for `entity`. Returns
     * the index at which to splice the entity in.
     */
    const sortedInsertPosition = (arr: Entity[], entity: Entity): number => {
        let lo = 0, hi = arr.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (comparator!(arr[mid], entity) <= 0) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    };

    /** Insert `entity` into a single bucket. Throws on unique conflict. */
    const insertIntoBucket = (entity: Entity, entry: BucketEntry): void => {
        const { key } = entry;
        if (unique) {
            const existing = buckets.get(key);
            if (existing !== undefined && existing !== entity) {
                throw new Error(
                    `Unique index conflict on key ${key}: ` +
                    `existing entity ${existing}, new entity ${entity}`,
                );
            }
            buckets.set(key, entity);
            if (entry.rawValues && !bucketValues.has(key)) {
                bucketValues.set(key, entry.rawValues);
            }
            if (isComputed && !bucketKeyValue.has(key)) {
                bucketKeyValue.set(key, entry.derived);
            }
        } else {
            let arr = buckets.get(key) as Entity[] | undefined;
            if (!arr) {
                buckets.set(key, (arr = []));
                if (entry.rawValues) bucketValues.set(key, entry.rawValues);
                if (isComputed) bucketKeyValue.set(key, entry.derived);
            }
            if (isSorted) {
                // Binary-insert keeps the bucket sorted at all times.
                arr.splice(sortedInsertPosition(arr, entity), 0, entity);
            } else {
                arr.push(entity);
            }
        }
    };

    /** Remove `entity` from a single bucket and clean up empty buckets. */
    const removeFromBucket = (entity: Entity, key: string): void => {
        if (unique) {
            buckets.delete(key);
            bucketValues.delete(key);
            bucketKeyValue.delete(key);
        } else {
            const arr = buckets.get(key) as Entity[] | undefined;
            if (!arr) return;
            const idx = arr.indexOf(entity);
            if (idx >= 0) {
                if (isSorted) {
                    // Order-preserving splice — can't use swap-with-last.
                    arr.splice(idx, 1);
                } else {
                    arr[idx] = arr[arr.length - 1];
                    arr.pop();
                }
            }
            if (arr.length === 0) {
                buckets.delete(key);
                bucketValues.delete(key);
                bucketKeyValue.delete(key);
            }
        }
    };

    /** Extract the sort tuple from `values` for this entity. */
    const sortTupleFrom = (values: Readonly<Record<string, unknown>>): unknown[] =>
        orderKeys.map((k) => values[k]);

    const add = (entity: Entity, values: Readonly<Record<string, unknown>>): void => {
        const entries = bucketEntriesFor(values);
        if (entries === null) return;
        // Dedup keys — an array with repeated elements (e.g. `["joe","joe"]`)
        // produces duplicate fan-out entries; the entity should still land in
        // each bucket exactly once.
        if (unique) {
            for (const entry of entries) {
                const existing = buckets.get(entry.key);
                if (existing !== undefined && existing !== entity) {
                    throw new Error(
                        `Unique index conflict on key ${entry.key}: ` +
                        `existing entity ${existing}, new entity ${entity}`,
                    );
                }
            }
        }
        // Populate the sort cache BEFORE `insertIntoBucket` so the binary
        // search sees the entity's sort tuple via the comparator.
        if (isSorted) sortCache.set(entity, sortTupleFrom(values));
        const seen = new Set<string>();
        const keys: string[] = [];
        for (const entry of entries) {
            if (seen.has(entry.key)) continue;
            seen.add(entry.key);
            insertIntoBucket(entity, entry);
            keys.push(entry.key);
        }
        entityKeys.set(entity, keys);
    };

    const remove = (entity: Entity): void => {
        const keys = entityKeys.get(entity);
        if (!keys) return;
        for (const key of keys) removeFromBucket(entity, key);
        entityKeys.delete(entity);
        if (isSorted) sortCache.delete(entity);
    };

    const update = (entity: Entity, values: Readonly<Record<string, unknown>>): void => {
        // Re-derive the full bucket set and diff against the current.
        // Dedup `next` by key first so an array with repeated elements
        // doesn't produce duplicate inserts.
        const rawNext = bucketEntriesFor(values);
        let next: BucketEntry[] | null = null;
        const nextKeys: string[] = [];
        if (rawNext) {
            const seen = new Set<string>();
            next = [];
            for (const entry of rawNext) {
                if (seen.has(entry.key)) continue;
                seen.add(entry.key);
                next.push(entry);
                nextKeys.push(entry.key);
            }
        }
        const prevKeys = entityKeys.get(entity) ?? [];

        // For sorted indexes the sort tuple may have changed even when
        // every bucket key stayed the same (e.g., entity's `fractIndex`
        // moved but `parent` didn't). Detect a sort-tuple-only change
        // and re-position the entity within its buckets in place.
        if (isSorted && next && nextKeys.length === prevKeys.length) {
            let sameBuckets = true;
            for (let i = 0; i < nextKeys.length; i++) {
                if (nextKeys[i] !== prevKeys[i]) { sameBuckets = false; break; }
            }
            if (sameBuckets) {
                const oldTuple = sortCache.get(entity);
                const newTuple = sortTupleFrom(values);
                const tupleChanged = !oldTuple || newTuple.some((v, i) => v !== oldTuple[i]);
                if (!tupleChanged) return;
                // Update cache, then remove+reinsert the entity in each
                // bucket to restore sorted order under the new tuple.
                // (Cache must be updated AFTER removing — removeFromBucket
                // uses the *old* position which the *old* comparator
                // would have produced; with binary search it scans, so
                // safe either way, but update cache between for clarity.)
                if (!unique) {
                    for (const key of nextKeys) {
                        const arr = buckets.get(key) as Entity[] | undefined;
                        if (!arr) continue;
                        const idx = arr.indexOf(entity);
                        if (idx >= 0) arr.splice(idx, 1);
                    }
                }
                sortCache.set(entity, newTuple);
                if (!unique) {
                    for (const key of nextKeys) {
                        const arr = buckets.get(key) as Entity[] | undefined;
                        if (!arr) continue;
                        arr.splice(sortedInsertPosition(arr, entity), 0, entity);
                    }
                }
                return;
            }
        }

        if (next && nextKeys.length === prevKeys.length) {
            // Fast path: identical key sets, in same order — common when
            // an update doesn't touch any indexed component (and, for
            // sorted indexes, the sort tuple is also unchanged — handled
            // above).
            let identical = true;
            for (let i = 0; i < nextKeys.length; i++) {
                if (nextKeys[i] !== prevKeys[i]) { identical = false; break; }
            }
            if (identical && !isSorted) return;
        }

        const nextSet = new Set(nextKeys);
        const prevSet = new Set(prevKeys);

        // Unique pre-check on the new keys we don't already own.
        if (unique && next) {
            for (const entry of next) {
                if (prevSet.has(entry.key)) continue;
                const existing = buckets.get(entry.key);
                if (existing !== undefined && existing !== entity) {
                    throw new Error(
                        `Unique index conflict on key ${entry.key}: ` +
                        `existing entity ${existing}, new entity ${entity}`,
                    );
                }
            }
        }

        // Drop the buckets we left.
        for (const key of prevKeys) {
            if (!nextSet.has(key)) removeFromBucket(entity, key);
        }
        // Refresh sort cache before re-inserting so binary search sees
        // the *new* sort tuple.
        if (isSorted && next) sortCache.set(entity, sortTupleFrom(values));
        // Insert into the buckets we joined.
        if (next) {
            for (const entry of next) {
                if (!prevSet.has(entry.key)) insertIntoBucket(entity, entry);
            }
        }

        if (nextKeys.length === 0) entityKeys.delete(entity);
        else entityKeys.set(entity, nextKeys);
    };

    const clear = (): void => {
        buckets.clear();
        bucketValues.clear();
        bucketKeyValue.clear();
        entityKeys.clear();
        if (isSorted) sortCache.clear();
    };

    const find = (arg: unknown): readonly Entity[] => {
        const key = isComputed
            ? serializeLookupKey(arg)
            : lookupKeyForRaw(arg as Readonly<Record<string, unknown>>);
        if (key === null) return [];
        const bucket = buckets.get(key);
        if (bucket === undefined) return [];
        return unique ? [bucket as Entity] : (bucket as Entity[]).slice();
    };

    const findRange = (arg: unknown): readonly Entity[] =>
        isComputed ? findRangeComputed(arg) : findRangeRaw(arg as Filter<Record<string, unknown>>);

    // Dedup via Set — with array fan-out the same entity can sit in
    // multiple buckets that all match a range, but the caller wants each
    // entity at most once. For scalar indexes the dedup is a no-op.
    const findRangeRaw = (range: Filter<Record<string, unknown>>): readonly Entity[] => {
        const predicate = getRowPredicateFromFilter(range);
        const result = new Set<Entity>();
        for (const [key, bucketEntries] of buckets) {
            const values = bucketValues.get(key)!;
            const adapter = {
                columns: Object.fromEntries(
                    components.map(c => [c, { get: () => values[c] }]),
                ),
            };
            if (predicate(adapter as never, 0)) {
                if (unique) result.add(bucketEntries as Entity);
                else for (const e of bucketEntries as Entity[]) result.add(e);
            }
        }
        return [...result];
    };

    const findRangeComputed = (range: unknown): readonly Entity[] => {
        if (!isOperatorObject(range)) return find(range);
        const ops = range;
        const result = new Set<Entity>();
        for (const [key, bucketEntries] of buckets) {
            const derived = bucketKeyValue.get(key);
            if (matchesOperators(derived, ops)) {
                if (unique) result.add(bucketEntries as Entity);
                else for (const e of bucketEntries as Entity[]) result.add(e);
            }
        }
        return [...result];
    };

    const getOne = (arg: unknown): Entity | undefined => {
        if (!unique) {
            throw new Error("Database.Index.Handle.get is only available on unique indexes");
        }
        const key = isComputed
            ? serializeLookupKey(arg)
            : lookupKeyForRaw(arg as Readonly<Record<string, unknown>>);
        if (key === null) return undefined;
        return buckets.get(key) as Entity | undefined;
    };

    /**
     * For each bucket this `values` would land in, check whether the
     * bucket is already claimed. Returns the FIRST colliding entity (if
     * `excludeEntity` is given, collisions against that entity count as
     * available). Used by both the insert and update pre-checks.
     */
    const findUniqueConflict = (
        values: Readonly<Record<string, unknown>>,
        excludeEntity: Entity | null,
    ): Entity | null => {
        if (!unique) return null;
        const entries = bucketEntriesFor(values);
        if (entries === null) return null;
        for (const { key } of entries) {
            const existing = buckets.get(key);
            if (existing === undefined) continue;
            if (excludeEntity !== null && existing === excludeEntity) continue;
            return existing as Entity;
        }
        return null;
    };

    return {
        components,
        unique,
        compute,
        order,
        add,
        remove,
        update,
        clear,
        get size() { return entityKeys.size; },
        find,
        findRange,
        get: getOne,
        checkUniqueAvailable: (values) => findUniqueConflict(values, null),
        checkUniqueAvailableForUpdate: (excludeEntity, values) =>
            findUniqueConflict(values, excludeEntity),
    };
};
