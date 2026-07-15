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
    readonly data?: unknown;
};

type SerializedCore = {
    readonly version: number;
    readonly componentSchemas: object;
    readonly entityLocationTableData: unknown;
    readonly archetypesData: readonly SerializedArchetype[];
};

export function createCore<NC extends ComponentSchemas>(newComponentSchemas: NC): Core<Simplify<OptionalComponents & { [K in StringKeyof<NC>]: Schema.ToType<NC[K]> }>> {
    type C = RequiredComponents & { [K in StringKeyof<NC>]: Schema.ToType<NC[K]> };

    const componentSchemas: { readonly [K in StringKeyof<C & RequiredComponents & OptionalComponents>]: Schema } = {
        id: Entity.schema,
        nonPersistent: True.schema,
        ...newComponentSchemas
    };
    const persistentLocationTable = createEntityLocationTable(16, false);
    const nonPersistentLocationTable = createEntityLocationTable(16, true);
    const getLocationTable = (entity: Entity) => entity < 0 ? nonPersistentLocationTable : persistentLocationTable;
    const archetypes = [] as unknown as Archetype<C & RequiredComponents & OptionalComponents>[] & { readonly [x: string]: Archetype<C> };

    const queryArchetypes = <
        Include extends StringKeyof<C & RequiredComponents & OptionalComponents>,
    >(
        include: readonly Include[] | ReadonlySet<string>,
        options?: ArchetypeQueryOptions<C>
    ): readonly Archetype<RequiredComponents & Pick<C & OptionalComponents, Include>>[] => {
        const includeArray = Array.from(include);
        const results: Archetype<RequiredComponents & Pick<C & OptionalComponents, Include>>[] = [];
        for (const archetype of archetypes) {
            const hasAllRequired = includeArray.every(comp => archetype.columns[comp] !== undefined);
            const hasNoExcluded = !options?.exclude || options.exclude.every(comp => archetype.columns[comp] === undefined);
            if (hasAllRequired && hasNoExcluded) {
                results.push(archetype as unknown as Archetype<RequiredComponents & Pick<C & OptionalComponents, Include>>);
            }
        }
        return results;
    }

    const ensureArchetype = <CC extends StringKeyof<C & RequiredComponents & OptionalComponents>>(componentNames: readonly CC[] | ReadonlySet<CC>): Archetype<RequiredComponents & { [K in CC]: (C & RequiredComponents & OptionalComponents)[K] }> => {
        const componentCount = Array.isArray(componentNames)
            ? (componentNames as readonly CC[]).length
            : (componentNames as ReadonlySet<CC>).size;
        for (const archetype of queryArchetypes(componentNames)) {
            if (archetype.components.size === componentCount) {
                return archetype as unknown as Archetype<RequiredComponents & { [K in CC]: (C & RequiredComponents & OptionalComponents)[K] }>;
            }
        }
        const id = archetypes.length;
        const archetypeComponentSchemas: { [K in CC]: Schema } = {} as { [K in CC]: Schema };
        let hasId = false;
        let isNonPersistent = false;
        for (const comp of componentNames as Iterable<CC>) {
            if (comp === "id") {
                hasId = true;
            }
            if (comp === "nonPersistent") {
                isNonPersistent = true;
            }
            archetypeComponentSchemas[comp] = componentSchemas[comp];
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
        return archetype as unknown as Archetype<RequiredComponents & { [K in CC]: (C & RequiredComponents & OptionalComponents)[K] }>;
    }

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
        if (addComponents || removeComponents) {
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
            newArchetype = ensureArchetype(newComponents as ReadonlySet<StringKeyof<C & RequiredComponents & OptionalComponents>>) as unknown as Archetype<C & RequiredComponents & OptionalComponents>;
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
            archetypesData: archetypes.map((archetype): SerializedArchetype =>
                archetype.components.has("nonPersistent")
                    ? { componentNames: [...archetype.components] }
                    : { componentNames: [...archetype.components], data: archetype.toData(copy) }
            )
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
            for (const { componentNames, data: archetypeData } of data.archetypesData) {
                // Recreating the archetype reserves its id and leaves it
                // empty; only persistent entries carry data to restore.
                const archetype = ensureArchetype(componentNames as StringKeyof<C & RequiredComponents & OptionalComponents>[]);
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
    position: number;
    health: string;
}>>>
type TestTypeComponents = TestType["componentSchemas"]
type CheckComponents = Assert<Equal<TestTypeComponents, {
    readonly id: Schema;
    readonly nonPersistent: Schema;
    readonly position: Schema;
    readonly health: Schema;
}>>;