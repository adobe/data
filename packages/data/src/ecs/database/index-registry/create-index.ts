// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Entity } from "../../entity/entity.js";
import { Filter, getRowPredicateFromFilter } from "../../../table/select-rows.js";

const KEY_SEPARATOR = "\x1f"; // ASCII unit separator — not a valid char in JSON output

export interface IndexState {
    /** Ordered list of component keys participating in the index. */
    readonly components: readonly string[];
    /** When true, at most one entity per key tuple. */
    readonly unique: boolean;
}

/**
 * Runtime instance of a single declared index. Owns the bucket maps and
 * exposes the same lookup methods that the type-level `Database.Index.Handle`
 * advertises (find/findRange/get for unique).
 *
 * Maintenance is incremental: `add` / `remove` / `update` are called from the
 * registry as mutations happen. The reverse map keyed by entity is what makes
 * `update` and `remove` O(1) when the previous key is unknown.
 *
 * Pre-check helpers (`checkUniqueAvailable`, `checkUniqueAvailableForUpdate`)
 * exist so the Store can detect a unique-key collision *before* mutating the
 * column store, keeping store and index consistent even when the user's
 * transaction body re-throws between mutations.
 */
export interface RuntimeIndex extends IndexState {
    add(entity: Entity, values: Readonly<Record<string, unknown>>): void;
    remove(entity: Entity): void;
    update(entity: Entity, values: Readonly<Record<string, unknown>>): void;
    clear(): void;
    readonly size: number;
    find(values: Readonly<Record<string, unknown>>): readonly Entity[];
    findRange(range: Filter<Record<string, unknown>>): readonly Entity[];
    /** Throws if `unique` is false. The type system also prevents this at the call site. */
    get(values: Readonly<Record<string, unknown>>): Entity | undefined;
    /**
     * For unique indexes only — non-unique indexes return `null` without
     * doing any work. Returns `null` when the (potentially-new) key from
     * `values` does not collide with any existing entry; returns the
     * existing entity holding that key when it does. Callers should
     * throw on a non-null return *before* performing any mutation.
     */
    checkUniqueAvailable(values: Readonly<Record<string, unknown>>): Entity | null;
    /**
     * Like `checkUniqueAvailable` but for updates — the `excludeEntity`
     * argument is the entity currently being updated; a collision with
     * itself is not a conflict.
     */
    checkUniqueAvailableForUpdate(
        excludeEntity: Entity,
        values: Readonly<Record<string, unknown>>,
    ): Entity | null;
}

export const createIndex = (state: IndexState): RuntimeIndex => {
    const { components, unique } = state;

    // Non-unique: bucket holds an Entity[]; unique: bucket holds a single Entity.
    const buckets = new Map<string, Entity | Entity[]>();
    // Per-bucket parsed values, used by findRange so we never re-parse the key string.
    const bucketValues = new Map<string, Record<string, unknown>>();
    // Reverse map: where each entity currently sits, so update/remove are O(1).
    const entityKeys = new Map<Entity, string>();

    const computeKey = (values: Readonly<Record<string, unknown>>): string | null => {
        const parts: string[] = [];
        for (const c of components) {
            const v = values[c];
            if (v === undefined) return null;
            parts.push(JSON.stringify(v));
        }
        return parts.join(KEY_SEPARATOR);
    };

    const indexedValues = (values: Readonly<Record<string, unknown>>): Record<string, unknown> => {
        const out: Record<string, unknown> = {};
        for (const c of components) out[c] = values[c];
        return out;
    };

    const add = (entity: Entity, values: Readonly<Record<string, unknown>>): void => {
        const key = computeKey(values);
        if (key === null) return;
        if (unique) {
            const existing = buckets.get(key);
            if (existing !== undefined && existing !== entity) {
                throw new Error(
                    `Unique index conflict on key ${JSON.stringify(indexedValues(values))}: ` +
                    `existing entity ${existing}, new entity ${entity}`,
                );
            }
            buckets.set(key, entity);
            if (!bucketValues.has(key)) bucketValues.set(key, indexedValues(values));
        } else {
            let arr = buckets.get(key) as Entity[] | undefined;
            if (!arr) {
                buckets.set(key, (arr = []));
                bucketValues.set(key, indexedValues(values));
            }
            arr.push(entity);
        }
        entityKeys.set(entity, key);
    };

    const remove = (entity: Entity): void => {
        const key = entityKeys.get(entity);
        if (key === undefined) return;
        if (unique) {
            buckets.delete(key);
            bucketValues.delete(key);
        } else {
            const arr = buckets.get(key) as Entity[] | undefined;
            if (arr) {
                const idx = arr.indexOf(entity);
                if (idx >= 0) {
                    arr[idx] = arr[arr.length - 1];
                    arr.pop();
                }
                if (arr.length === 0) {
                    buckets.delete(key);
                    bucketValues.delete(key);
                }
            }
        }
        entityKeys.delete(entity);
    };

    const update = (entity: Entity, values: Readonly<Record<string, unknown>>): void => {
        const newKey = computeKey(values);
        const oldKey = entityKeys.get(entity);
        if (newKey === oldKey) return;
        if (oldKey !== undefined) remove(entity);
        if (newKey !== null) add(entity, values);
    };

    const clear = (): void => {
        buckets.clear();
        bucketValues.clear();
        entityKeys.clear();
    };

    const find = (values: Readonly<Record<string, unknown>>): readonly Entity[] => {
        const key = computeKey(values);
        if (key === null) return [];
        const bucket = buckets.get(key);
        if (bucket === undefined) return [];
        return unique ? [bucket as Entity] : (bucket as Entity[]).slice();
    };

    const findRange = (range: Filter<Record<string, unknown>>): readonly Entity[] => {
        const predicate = getRowPredicateFromFilter(range);
        const result: Entity[] = [];
        for (const [key, bucketEntries] of buckets) {
            const values = bucketValues.get(key)!;
            // Adapter: getRowPredicateFromFilter generates code reading
            // `table.columns.<key>.get(row)` — we satisfy the interface with a
            // one-row façade over the bucket's parsed values.
            const adapter = {
                columns: Object.fromEntries(
                    components.map(c => [c, { get: () => values[c] }]),
                ),
            };
            if (predicate(adapter as never, 0)) {
                if (unique) result.push(bucketEntries as Entity);
                else result.push(...(bucketEntries as Entity[]));
            }
        }
        return result;
    };

    const getOne = (values: Readonly<Record<string, unknown>>): Entity | undefined => {
        if (!unique) {
            throw new Error("Database.Index.Handle.get is only available on unique indexes");
        }
        const key = computeKey(values);
        if (key === null) return undefined;
        return buckets.get(key) as Entity | undefined;
    };

    const checkUniqueAvailable = (
        values: Readonly<Record<string, unknown>>,
    ): Entity | null => {
        if (!unique) return null;
        const key = computeKey(values);
        if (key === null) return null;
        const existing = buckets.get(key);
        return existing === undefined ? null : (existing as Entity);
    };

    const checkUniqueAvailableForUpdate = (
        excludeEntity: Entity,
        values: Readonly<Record<string, unknown>>,
    ): Entity | null => {
        if (!unique) return null;
        const key = computeKey(values);
        if (key === null) return null;
        const existing = buckets.get(key);
        if (existing === undefined) return null;
        return existing === excludeEntity ? null : (existing as Entity);
    };

    return {
        components,
        unique,
        add,
        remove,
        update,
        clear,
        get size() { return entityKeys.size; },
        find,
        findRange,
        get: getOne,
        checkUniqueAvailable,
        checkUniqueAvailableForUpdate,
    };
};
