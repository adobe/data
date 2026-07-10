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

// An archetype lives in the nonPersistent (negative-ID) space when its
// component set carries the `nonPersistent` marker — or the deprecated
// `ephemeral` one, which `ensureArchetype` still routes to that same space.
const isNonPersistentComponentSet = (components: Iterable<string>): boolean => {
    for (const c of components) {
        if (c === "nonPersistent" || c === "ephemeral") return true;
    }
    return false;
};

export function createCore<NC extends ComponentSchemas>(newComponentSchemas: NC): Core<Simplify<OptionalComponents & { [K in StringKeyof<NC>]: Schema.ToType<NC[K]> }>> {
    type C = RequiredComponents & { [K in StringKeyof<NC>]: Schema.ToType<NC[K]> };

    const componentSchemas: { readonly [K in StringKeyof<C & RequiredComponents & OptionalComponents>]: Schema } = {
        id: Entity.schema,
        nonPersistent: True.schema,
        ephemeral: True.schema,
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
            } else if (comp === "ephemeral") {
                console.warn('"ephemeral" component is deprecated, use "nonPersistent"');
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

    const readEntity = (entity: Entity, minArchetype?: ReadonlyArchetype<C> | Archetype<C>): any => {
        const location = locateInternal(entity);
        if (location === null) {
            return null;
        }
        const archetype = archetypes[location.archetype];
        if (minArchetype && location.archetype !== minArchetype.id && !archetype.components.isSupersetOf(minArchetype.components)) {
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
        if ("nonPersistent" in components || "ephemeral" in components) {
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
        toData: (copy = false) => ({
            componentSchemas,
            entityLocationTableData: persistentLocationTable.toData(copy),
            // Archetypes in the nonPersistent (negative-ID) space back
            // session-only resources and entities. That space is never
            // serialized — `entityLocationTableData` above only covers the
            // persistent location table — so their row data must not leak
            // into the snapshot.
            //
            // They cannot simply be dropped, though: an archetype's id is its
            // index in this dense array and is stored (by index) in the
            // persistent location table. Omitting a nonPersistent archetype
            // that precedes a persistent one would shift every later id on
            // reload, leaving persistent entities pointing at the wrong
            // archetype. So we keep every archetype's slot to preserve ids,
            // but serialize nonPersistent ones as a data-free stub carrying
            // only their component names (enough for `fromData` to recreate
            // the empty archetype at the same id).
            archetypesData: archetypes.map(archetype =>
                isNonPersistentComponentSet(archetype.components)
                    ? { componentNames: [...archetype.components] }
                    : archetype.toData(copy)
            )
        }),
        fromData: (data: any) => {
            Object.assign(componentSchemas, data.componentSchemas);
            persistentLocationTable.fromData(data.entityLocationTableData);
            for (let i = 0; i < data.archetypesData.length; i++) {
                const entry = data.archetypesData[i];
                // Persistent entries carry `columns`; nonPersistent stubs carry
                // only `componentNames` (see `toData`).
                const componentNames: string[] = entry.componentNames ?? Object.keys(entry.columns);
                const archetype = ensureArchetype(componentNames as any);
                // Recreating the archetype above already reserves its id and
                // leaves it empty; only persistent archetypes restore rows.
                if (!isNonPersistentComponentSet(componentNames)) {
                    archetype.fromData(entry);
                }
            }
        }
    };
    return core as any;
}

type TestType = ReturnType<typeof createCore<{ position: { type: "number" }, health: { type: "string" } }>>
type CheckTestType = Assert<Equal<TestType, Core<{
    nonPersistent: true;
    ephemeral?: true;
    position: number;
    health: string;
}>>>
type TestTypeComponents = TestType["componentSchemas"]
type CheckComponents = Assert<Equal<TestTypeComponents, {
    readonly id: Schema;
    readonly nonPersistent: Schema;
    readonly ephemeral: Schema;
    readonly position: Schema;
    readonly health: Schema;
}>>;