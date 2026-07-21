// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "../../../schema/index.js";
import { createEntityLocationTable } from "../../entity-location-table/index.js";
import * as ARCHETYPE from "../../archetype/index.js";
import { Table, getRowData, addRow, updateRow } from "../../../table/index.js";
import { Archetype, ReadonlyArchetype } from "../../archetype/archetype.js";
import { RequiredComponents } from "../../required-components.js";
import { Entity } from "../../entity/entity.js";
import { Core, EntityUpdateValues, ArchetypeQueryOptions } from "./core.js";
import { Assert, Equal, Simplify, StringKeyof } from "../../../types/index.js";
import { ComponentSchemas } from "../../component-schemas.js";
import { OptionalComponents } from "../../optional-components.js";
import { True } from "../../../schema/true/index.js";
import { PartitionKeysOf } from "../partition.js";

/**
 * Serialization format version stamped into every `toData` snapshot and
 * checked by `fromData`. A mismatch is thrown rather than silently
 * mis-reconstructed, so an incompatible snapshot fails loudly at load.
 *
 * Version 1 is the first *versioned* format. Snapshots produced before this
 * field existed carry no `version` and are therefore rejected — they used an
 * incompatible archetype-entry shape. Bump this whenever the snapshot shape
 * changes in a way older readers cannot load.
 */
export const ECS_SNAPSHOT_VERSION = 1;

/**
 * One archetype's entry in a serialized snapshot. Every archetype
 * contributes an entry so its `id` (a dense index into `archetypes`, stored
 * by value in the persistent location table) is reproduced exactly on load.
 * Only persistent archetypes carry `data`: nonPersistent archetypes back the
 * negative-ID entity space, whose location table is never serialized, so
 * their rows are not persistent state.
 */
type SerializedArchetype = {
    readonly componentNames: readonly string[];
    // Per-partition-component const values, needed to reconstruct the exact
    // value-child on restore (the value is part of archetype identity but is
    // not derivable from `componentNames` alone). Absent for non-partition
    // archetypes.
    readonly partitionValues?: Record<string, unknown>;
    readonly data?: unknown;
};

type SerializedCore = {
    readonly version: number;
    readonly componentSchemas: object;
    readonly entityLocationTableData: unknown;
    readonly archetypesData: readonly SerializedArchetype[];
};

export function createCore<NC extends ComponentSchemas>(
    newComponentSchemas: NC,
    /**
     * Called once, right after each archetype is created (direct or lazily as a
     * partition value-child). The Store layer uses it to decorate the
     * archetype's `insert` in place with index maintenance — so every write
     * path (direct insert, router routing, migration target) shares one
     * maintained insert with no wrapper or Proxy indirection.
     */
    onArchetypeCreated?: (archetype: Archetype<any>) => void,
): Core<Simplify<OptionalComponents & { [K in StringKeyof<NC>]: Schema.ToType<NC[K]> }>, PartitionKeysOf<NC>> {
    type C = RequiredComponents & { [K in StringKeyof<NC>]: Schema.ToType<NC[K]> };

    const componentSchemas: { readonly [K in StringKeyof<C & RequiredComponents & OptionalComponents>]: Schema } = {
        id: Entity.schema,
        nonPersistent: True.schema,
        // Declared built-in (no behavior wired yet) — mirrors nonPersistent so
        // apps can model local vs. shared scope; the store does not act on it.
        nonShared: True.schema,
        ...newComponentSchemas
    };
    const persistentLocationTable = createEntityLocationTable(16, false);
    const nonPersistentLocationTable = createEntityLocationTable(16, true);
    const getLocationTable = (entity: Entity) => entity < 0 ? nonPersistentLocationTable : persistentLocationTable;
    const archetypes = [] as unknown as Archetype<C & RequiredComponents & OptionalComponents>[] & { readonly [x: string]: Archetype<C> };

    // A component declared `partition: true`: every distinct runtime value gets
    // its own archetype whose column for that component is a const buffer (zero
    // per-row bytes). Read from the *live* component schema so components added
    // after createCore (via the Store layer's `extend`) are detected too. Cost
    // is only paid when *resolving* an archetype (an O(names) scan) — never on
    // the per-row insert hot path, which goes straight to a concrete archetype.
    const isPartition = (name: string): boolean =>
        (componentSchemas[name as StringKeyof<typeof componentSchemas>] as Schema | undefined)?.partition === true;

    // Identity → archetype. Replaces the former linear scan (O(archetypes) per
    // resolve) with an O(1) lookup, and — for partition components — folds the
    // per-archetype const value into the key so value-children are distinct.
    const archetypeByIdentity = new Map<string, Archetype<any>>();
    const partitionNamesIn = (sortedNames: readonly string[]): string[] =>
        sortedNames.filter(isPartition);
    const identityKey = (
        sortedNames: readonly string[],
        partitionValues: Record<string, unknown> | undefined,
        partitionNames: readonly string[],
    ): string => {
        const base = sortedNames.join(",");
        if (partitionNames.length === 0) return base;
        // `typeof` tag guards "1"(number) vs "1"(string) collisions.
        const vals = partitionNames
            .map((n) => `${n}=${typeof partitionValues![n]}:${String(partitionValues![n])}`)
            .join(",");
        return `${base}|${vals}`;
    };

    const queryArchetypes = <
        Include extends StringKeyof<C & RequiredComponents & OptionalComponents>,
    >(
        include: readonly Include[] | ReadonlySet<string>,
        options?: ArchetypeQueryOptions<C>
    ): readonly Archetype<RequiredComponents & Pick<C & OptionalComponents, Include>>[] => {
        const includeArray = Array.from(include);
        const where = options?.where as Record<string, unknown> | undefined;
        const results: Archetype<RequiredComponents & Pick<C & OptionalComponents, Include>>[] = [];
        for (const archetype of archetypes) {
            const hasAllRequired = includeArray.every(comp => archetype.columns[comp] !== undefined);
            const hasNoExcluded = !options?.exclude || options.exclude.every(comp => archetype.columns[comp] === undefined);
            // Partition `where`: a partition column is const per archetype, so a
            // value filter is decidable at archetype granularity (O(archetypes),
            // no row scan). Read the const via get(0) — valid even at rowCount 0.
            let matchesWhere = true;
            if (where) {
                for (const key in where) {
                    const column = archetype.columns[key];
                    if (column === undefined || column.get(0) !== where[key]) {
                        matchesWhere = false;
                        break;
                    }
                }
            }
            if (hasAllRequired && hasNoExcluded && matchesWhere) {
                results.push(archetype as unknown as Archetype<RequiredComponents & Pick<C & OptionalComponents, Include>>);
            }
        }
        return results;
    }

    // Concrete archetype for exactly `componentNames`, resolved by identity and
    // created on first use. A partition component in the set requires its value
    // in `partitionValues`; that value is baked into the column schema as
    // `const`, so the column is a zero-per-row const buffer. This is the single
    // internal primitive behind ensureArchetype, the router, migration, and
    // restore — the *only* place archetypes are created.
    const resolveArchetype = (
        componentNames: readonly string[] | ReadonlySet<string>,
        partitionValues?: Record<string, unknown>,
    ): Archetype<any> => {
        const namesArr = Array.from(componentNames);
        const sorted = namesArr.slice().sort();
        const partitionNames = partitionNamesIn(sorted);
        for (const n of partitionNames) {
            if (partitionValues?.[n] === undefined) {
                throw new Error(`partition component '${n}' requires a value to resolve a concrete archetype`);
            }
        }
        const key = identityKey(sorted, partitionValues, partitionNames);
        const existing = archetypeByIdentity.get(key);
        if (existing) return existing;

        const id = archetypes.length;
        const archetypeComponentSchemas: Record<string, Schema> = {};
        let hasId = false;
        let isNonPersistent = false;
        for (const comp of namesArr) {
            if (comp === "id") hasId = true;
            if (comp === "nonPersistent") isNonPersistent = true;
            const base = componentSchemas[comp as StringKeyof<typeof componentSchemas>];
            archetypeComponentSchemas[comp] = isPartition(comp)
                ? { ...base, const: partitionValues![comp] }
                : base;
        }
        if (!hasId) {
            throw new Error("id is required");
        }
        const archetype = ARCHETYPE.createArchetype(
            archetypeComponentSchemas as any,
            id,
            isNonPersistent ? nonPersistentLocationTable : persistentLocationTable
        );
        archetypes.push(archetype as unknown as Archetype<C & RequiredComponents & OptionalComponents>);
        archetypeByIdentity.set(key, archetype);
        onArchetypeCreated?.(archetype);
        return archetype;
    };

    // Write-only handle over a partition family: reads the partition value(s)
    // from each row, resolves (creating on first use) the concrete child, and
    // inserts there. Its `insert` is the by-keys routing inserter.
    const makeRouter = (componentNames: readonly string[] | ReadonlySet<string>) => {
        const namesArr = Array.from(componentNames);
        const partitionNames = partitionNamesIn(namesArr.slice().sort());
        const partitionValuesOf = (rowData: any): Record<string, unknown> => {
            const values: Record<string, unknown> = {};
            for (const n of partitionNames) values[n] = rowData[n];
            return values;
        };
        return {
            components: new Set(namesArr),
            // Routes to the concrete child and calls its `insert`. When the Store
            // layer has decorated inserts with index maintenance (via
            // onArchetypeCreated), the child's `insert` is already the maintained
            // one — so routing needs no special-casing at the Store layer.
            insert: (rowData: any): Entity => resolveArchetype(namesArr, partitionValuesOf(rowData)).insert(rowData),
        };
    };

    const ensureArchetype = ((
        componentNames: readonly string[] | ReadonlySet<string>,
        partitionValues?: Record<string, unknown>,
    ): any => {
        if (partitionValues === undefined) {
            const namesArr = Array.from(componentNames);
            if (namesArr.some(isPartition)) {
                return makeRouter(componentNames);
            }
        }
        return resolveArchetype(componentNames, partitionValues);
    }) as Core<C>["ensureArchetype"];

    const locateInternal = (entity: Entity) => {
        return (entity < 0 ? nonPersistentLocationTable : persistentLocationTable).locate(entity);
    }

    const readEntity = (
        entity: Entity,
        archetypeOrComponents?: ReadonlyArchetype<any> | Archetype<any> | readonly string[]
    ): any => {
        const location = locateInternal(entity);
        if (location === null) {
            return null;
        }
        const archetype = archetypes[location.archetype];
        // Component-list form: a pure projection — never gates on membership.
        // Reads ONLY the requested components' columns (never the whole row); an
        // absent component is simply omitted (the field is optional in the type).
        if (Array.isArray(archetypeOrComponents)) {
            const projected: Record<string, unknown> = {};
            for (const component of archetypeOrComponents as readonly string[]) {
                const column = archetype.columns[component];
                if (column !== undefined) {
                    projected[component] = column.get(location.row);
                }
            }
            return projected;
        }
        // Archetype form: a membership gate — null unless the entity is a
        // superset of the archetype. The array case returned above, so a
        // defined `archetypeOrComponents` here is an archetype.
        const archetypeArg = archetypeOrComponents as ReadonlyArchetype<any> | undefined;
        if (archetypeArg && location.archetype !== archetypeArg.id && !archetype.components.isSupersetOf(archetypeArg.components)) {
            return null;
        }
        return getRowData(archetype, location.row);
    }

    const deleteEntity = (entity: Entity) => {
        const locationTable = getLocationTable(entity);
        const location = locationTable.locate(entity);
        if (location !== null) {
            const archetype = archetypes[location.archetype];
            if (!archetype) {
                throw new Error("Archetype not found: " + JSON.stringify(location));
            }
            ARCHETYPE.deleteRow(archetype, location.row, locationTable);
            locationTable.delete(entity);
        }
    }

    const updateEntity = (entity: Entity, components: EntityUpdateValues<C>) => {
        const currentLocation = locateInternal(entity);
        if (currentLocation === null) {
            throw new Error(`Entity not found ${entity}`);
        }
        if ("nonPersistent" in components) {
            throw new Error("Cannot update nonPersistent component");
        }
        const currentArchetype = archetypes[currentLocation.archetype];
        let newArchetype = currentArchetype;
        let addComponents: null | StringKeyof<C>[] = null;
        let removeComponents: null | StringKeyof<C>[] = null;
        for (const key in components) {
            if ((components as any)[key as any] === undefined) {
                (removeComponents ??= []).push(key as StringKeyof<C>);
                // we remove the delete components so we can use this object for the new row data
                delete (components as any)[key as any];
            }
            else if (!currentArchetype.components.has(key as StringKeyof<C>)) {
                (addComponents ??= []).push(key as StringKeyof<C>);
            }
        }
        // A partition value change migrates the entity to a different child
        // archetype even when the component *set* is unchanged, because the
        // partition value is part of archetype identity.
        let partitionValueChanged = false;
        for (const key in components) {
            if (isPartition(key) && currentArchetype.components.has(key as StringKeyof<C>)) {
                if ((components as any)[key] !== currentArchetype.columns[key]!.get(currentLocation.row)) {
                    partitionValueChanged = true;
                }
            }
        }
        if (addComponents || removeComponents || partitionValueChanged) {
            // currently changing archetype requires a set, but later we should have an edge map for better performance
            // Alternatively we can have a faster path using addComponent and deleteComponent.
            const newComponents = new Set(currentArchetype.components);
            if (addComponents) {
                for (const comp of addComponents) {
                    newComponents.add(comp);
                }
            }
            if (removeComponents) {
                for (const comp of removeComponents) {
                    newComponents.delete(comp);
                }
            }
            // Target child's partition values: the updated value where provided,
            // else the entity's current (const) value.
            let newPartitionValues: Record<string, unknown> | undefined;
            const targetPartitionNames = partitionNamesIn([...newComponents].sort());
            if (targetPartitionNames.length > 0) {
                newPartitionValues = {};
                for (const n of targetPartitionNames) {
                    newPartitionValues[n] = (n in components)
                        ? (components as any)[n]
                        : currentArchetype.columns[n]?.get(currentLocation.row);
                }
            }
            newArchetype = resolveArchetype(newComponents, newPartitionValues) as unknown as Archetype<C & RequiredComponents & OptionalComponents>;
        }
        if (newArchetype !== currentArchetype) {
            // create a new row in the new archetype
            const currentData = getRowData(currentArchetype, currentLocation.row);
            const currentLocationTable = getLocationTable(entity);
            // deletes the row from the current archetype (this will update the entity location table for any row which may have been moved into it's position)
            ARCHETYPE.deleteRow(currentArchetype, currentLocation.row, currentLocationTable);
            const newRow = addRow(newArchetype, { ...currentData, ...components });
            // update the entity location table for the entity so it points to the new archetype and row
            currentLocationTable.update(entity, { archetype: newArchetype.id, row: newRow });
        } else {
            updateRow(newArchetype, currentLocation.row, components as any);
        }
    }

    const getComponent = <K extends StringKeyof<C>>(entity: Entity, component: K): C[K] | undefined => {
        const location = locateInternal(entity);
        if (location === null) {
            return undefined;
        }
        const archetype = archetypes[location.archetype];
        const column = archetype.columns[component];
        return column?.get(location.row)
    }

    const compact = () => {
        for (const archetype of archetypes) {
            Table.compact(archetype);
        }
    };

    const resetCore = () => {
        persistentLocationTable.reset();
        nonPersistentLocationTable.reset();
        for (const archetype of archetypes) {
            archetype.rowCount = 0;
        }
    };

    const core: Core<C> = {
        componentSchemas: componentSchemas,
        queryArchetypes,
        ensureArchetype,
        locate: (entity) => {
            const location = locateInternal(entity);
            if (location === null) {
                return null;
            }
            return { archetype: archetypes[location.archetype] as any, row: location.row };
        },
        get: getComponent,
        read: readEntity,
        delete: deleteEntity,
        update: updateEntity,
        compact,
        reset: resetCore,
        toData: (copy = false): SerializedCore => ({
            version: ECS_SNAPSHOT_VERSION,
            componentSchemas,
            entityLocationTableData: persistentLocationTable.toData(copy),
            // Every archetype contributes an entry so its id (this array
            // index, stored by value in the persistent location table) is
            // reproduced on load. Only persistent archetypes carry `data`;
            // nonPersistent ones back the negative-ID space, whose location
            // table is never serialized, so their rows aren't persistent.
            archetypesData: archetypes.map((archetype): SerializedArchetype => {
                const componentNames = [...archetype.components];
                const partitionNames = partitionNamesIn(componentNames.slice().sort());
                const partitionValues = partitionNames.length > 0
                    ? Object.fromEntries(partitionNames.map((n) => [n, archetype.columns[n]!.get(0)]))
                    : undefined;
                return archetype.components.has("nonPersistent")
                    ? { componentNames, partitionValues }
                    : { componentNames, partitionValues, data: archetype.toData(copy) };
            })
        }),
        fromData: (data: SerializedCore) => {
            if (data.version !== ECS_SNAPSHOT_VERSION) {
                // Incompatible (or legacy, unversioned) snapshot. Skip the load
                // rather than throw: callers treat this as "no saved data" and
                // keep the freshly-constructed defaults.
                console.warn(
                    `Ignoring incompatible ECS snapshot: expected version ${ECS_SNAPSHOT_VERSION}, got ${String(data.version)}. ` +
                    `The serialization format has changed; keeping current state.`,
                );
                return;
            }
            Object.assign(componentSchemas, data.componentSchemas);
            // The non-persistent (negative-ID) space is never captured by
            // toData, so a load must revert it to defaults rather than leak the
            // loading store's pre-load live values across the load. Clear it the
            // same way reset() does; the persistent side below is fully
            // overwritten by the restore, so only the nonPersistent rows need
            // clearing here. The store layer re-seeds nonPersistent resource
            // defaults afterward (its rowCount === 0 re-init guard).
            nonPersistentLocationTable.reset();
            for (const archetype of archetypes) {
                if (archetype.components.has("nonPersistent")) {
                    archetype.rowCount = 0;
                }
            }
            persistentLocationTable.fromData(data.entityLocationTableData);
            for (const { componentNames, partitionValues, data: archetypeData } of data.archetypesData) {
                // Recreating the archetype reserves its id and leaves it
                // empty; only persistent entries carry data to restore.
                // resolveArchetype (not the public ensureArchetype) so a
                // partition archetype restores as its concrete value-child.
                const archetype = resolveArchetype(componentNames, partitionValues);
                if (archetypeData !== undefined) {
                    archetype.fromData(archetypeData);
                }
            }
        }
    };
    return core as any;
}

type TestType = ReturnType<typeof createCore<{ position: { type: "number" }, health: { type: "string" } }>>
type CheckTestType = Assert<Equal<TestType, Core<{
    nonPersistent: true;
    nonShared: true;
    position: number;
    health: string;
}>>>
type TestTypeComponents = TestType["componentSchemas"]
type CheckComponents = Assert<Equal<TestTypeComponents, {
    readonly id: Schema;
    readonly nonPersistent: Schema;
    readonly nonShared: Schema;
    readonly position: Schema;
    readonly health: Schema;
}>>;