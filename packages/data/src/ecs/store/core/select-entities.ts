// © 2026 Adobe. MIT License. See /LICENSE for details.

import { selectRows } from "../../../table/select-rows.js";
import { compare } from "../../../functions/compare.js";
import { StringKeyof } from "../../../types/types.js";
import { RequiredComponents } from "../../required-components.js";
import { Entity } from "../../entity/entity.js";
import { EntitySelectOptions } from "../entity-select-options.js";
import { Core } from "./core.js";
import { OptionalComponents } from "../../optional-components.js";

export const selectEntities = <
    C extends object,
    Include extends StringKeyof<C & OptionalComponents>
>(
    core: Core<C>,
    include: readonly Include[] | ReadonlySet<string>,
    options?: EntitySelectOptions<C & RequiredComponents, Pick<C & RequiredComponents & OptionalComponents, Include>>
): readonly Entity[] => {
    // Pass only archetype-level options (exclude) to queryArchetypes. `options.where`
    // here is a row-level Filter and is applied per-row below via selectRows — it
    // must NOT be forwarded as queryArchetypes' partition-equality `where`.
    const archetypes = core.queryArchetypes(include, options?.exclude ? { exclude: options.exclude } : undefined);
    let length = 0;
    for (const archetype of archetypes) {
        length += archetype.rowCount;
    }
    if (!options?.where && !options?.order) {
        // when there is no where filter or order we have a fast path
        // that just uses the id column as a typed array.
        const entities = new Array<Entity>(length);
        let index = 0;
        for (const archetype of archetypes) {
            const idTypedArray = archetype.columns.id.getTypedArray();
            for (let i = 0; i < archetype.rowCount; i++) {
                entities[index++] = idTypedArray[i];
            }
        }
        return entities;
    }
    if (options?.where && !options.order) {
        const entities = new Array<Entity>();
        for (const archetype of archetypes) {
            const idTypedArray = archetype.columns.id.getTypedArray();
            for (const row of selectRows<Pick<C & RequiredComponents & OptionalComponents, Include>>(archetype as any, options.where)) {
                entities.push(idTypedArray[row]);
            }
        }
        return entities;
    }

    // ── Ordered results ─────────────────────────────────────────────────────
    // When the *leading run* of order keys are partition components, each
    // archetype holds a constant value for them, so the archetypes already
    // bucket the rows on that leading key. We can then sort the buckets by
    // value, sort only the *remaining* keys within each bucket, and concatenate
    // in bucket order — turning an O(N log N) sort into O(N log(N/K)), and O(N)
    // when a partition key is the sole order key. When no leading order key is a
    // partition component (leadCount === 0) this falls back to one full sort,
    // matching the previous behaviour exactly.
    const order = options.order!;
    const schemas = core.componentSchemas;
    // Keys of `order` are, by OrderClause<Pick<…, Include>>, exactly the picked
    // component keys — safe to view as Include[].
    const orderKeys = Object.keys(order) as Include[];
    type Arch = (typeof archetypes)[number];
    // Order/partition keys are sortable columns, so their values are comparable
    // primitives — the contract `compare` accepts. Read them at that type.
    type Comparable = Parameters<typeof compare>[0];

    let leadCount = 0;
    while (leadCount < orderKeys.length && schemas[orderKeys[leadCount]]?.partition === true) {
        leadCount++;
    }

    const compareByKeys = (
        keys: readonly Include[],
        a: { readonly [k: string]: Comparable },
        b: { readonly [k: string]: Comparable },
    ): number => {
        for (const key of keys) {
            // `compare` (code-point for strings, numeric for numbers) — not
            // `a - b`, which is NaN for string order keys, and never locale.
            const cmp = compare(a[key], b[key]);
            if (cmp !== 0) return order[key] ? cmp : -cmp;
        }
        return 0;
    };

    // Gather ids for `archs`, sorted by `sortKeys` (empty → left in archetype +
    // row order). `where` is applied per row. A stable sort over the same gather
    // order keeps tie-ordering identical to the single full sort.
    const collect = (archs: readonly Arch[], sortKeys: readonly Include[]): Entity[] => {
        if (sortKeys.length === 0) {
            const ids: Entity[] = [];
            for (const archetype of archs) {
                const idTypedArray = archetype.columns.id.getTypedArray();
                for (const row of selectRows<Pick<C & RequiredComponents & OptionalComponents, Include>>(archetype as any, options.where)) {
                    ids.push(idTypedArray[row]);
                }
            }
            return ids;
        }
        const rows: { id: Entity; [k: string]: Comparable }[] = [];
        for (const archetype of archs) {
            const idTypedArray = archetype.columns.id.getTypedArray();
            for (const row of selectRows<Pick<C & RequiredComponents & OptionalComponents, Include>>(archetype as any, options.where)) {
                const value: { id: Entity; [k: string]: Comparable } = { id: idTypedArray[row] };
                for (const key of sortKeys) value[key] = archetype.columns[key]!.get(row) as Comparable;
                rows.push(value);
            }
        }
        rows.sort((a, b) => compareByKeys(sortKeys, a, b));
        return rows.map((r) => r.id);
    };

    if (leadCount === 0) {
        return collect(archetypes, orderKeys);
    }

    // Bucket archetypes by their leading partition-value tuple, preserving
    // archetype iteration order within a bucket (so tie-ordering matches the
    // full sort). A bucket can span multiple archetypes (shape fan-out).
    const leadKeys = orderKeys.slice(0, leadCount);
    const restKeys = orderKeys.slice(leadCount);
    const buckets = new Map<string, { values: Comparable[]; archs: Arch[] }>();
    for (const archetype of archetypes) {
        const values = leadKeys.map((key) => archetype.columns[key]!.get(0) as Comparable);
        // JSON is an unambiguous key for a primitive tuple: it distinguishes
        // 1 from "1" and never collides across tuple boundaries.
        const bucketKey = JSON.stringify(values);
        let bucket = buckets.get(bucketKey);
        if (!bucket) { bucket = { values, archs: [] }; buckets.set(bucketKey, bucket); }
        bucket.archs.push(archetype);
    }
    const orderedBuckets = [...buckets.values()].sort((a, b) => {
        for (let i = 0; i < leadKeys.length; i++) {
            const cmp = compare(a.values[i], b.values[i]);
            if (cmp !== 0) return order[leadKeys[i]] ? cmp : -cmp;
        }
        return 0;
    });
    const result: Entity[] = [];
    for (const bucket of orderedBuckets) {
        for (const id of collect(bucket.archs, restKeys)) result.push(id);
    }
    return result;
}
