// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "../../../schema/index.js";
import { createEntityLocationTable, remapSerializedArchetypeIds } from "../../entity-location-table/index.js";
import * as ARCHETYPE from "../../archetype/index.js";
import { Table, addRow, updateRow } from "../../../table/index.js";
// getRowData returns the WHOLE row (incl. the internal `id` column); it is only
// used here for the archetype-migration copy that must carry id into the new
// row. Public reads use `readRowExcludingId` below. It is not part of the
// public `@adobe/data/table` surface, so it is imported from the file directly.
import { getRowData } from "../../../table/get-row-data.js";
import { Archetype, ReadonlyArchetype } from "../../archetype/archetype.js";
import { RequiredComponents, ID, RESERVED_COMPONENT_NAMES } from "../../required-components.js";
import { Entity } from "../../entity/entity.js";
import { QUADRANT_COUNT, isPersistentQuadrant, quadrantFor, quadrantOf } from "../../entity/persistence-sharing.js";
import { PersistenceScope, ToDataOptions } from "../../persistence-scope.js";
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
 * Version 1 was the first *versioned* format. Version 2 changed the entity-id
 * encoding: durability + sharing are now a 2-bit quadrant in the id's low bits
 * (see entity/persistence-sharing), so persisted ids and the set of serialized
 * location tables both changed shape. Bump this whenever the snapshot shape
 * changes in a way older readers cannot load.
 */
export const ECS_SNAPSHOT_VERSION = 2;

/**
 * One archetype's entry in a serialized snapshot. Every archetype
 * contributes an entry so its `id` (a dense index into `archetypes`, stored
 * by value in the persistent location tables) is reproduced exactly on load.
 * Only persistent archetypes carry `data`: nonPersistent archetypes back the
 * non-persistent quadrants, whose location tables are never serialized, so
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
    // Serialized location tables for the persistent quadrants only, keyed by
    // quadrant (0 = document, 2 = settings). Non-persistent quadrants (1, 3)
    // are never serialized — they reset on load.
    readonly entityLocationTables: { readonly [quadrant: number]: unknown };
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

    // Reserved names (`id`, `nonPersistent`, `nonShared`) are the ECS's own
    // built-ins; a user schema defining one would silently clobber it, so reject
    // it loudly instead.
    for (const name of Object.keys(newComponentSchemas)) {
        if (RESERVED_COMPONENT_NAMES.includes(name)) {
            throw new Error(`Component name "${name}" is reserved by the ECS and cannot be defined.`);
        }
    }

    const componentSchemas: { readonly [K in StringKeyof<C & RequiredComponents & OptionalComponents>]: Schema } = {
        [ID]: Entity.schema,
        nonPersistent: True.schema,
        // Built-in sharing tag, mirror of nonPersistent. Together they place an
        // archetype's entities into one of four quadrants (persistence × sharing);
        // see entity/persistence-sharing.
        nonShared: True.schema,
        ...newComponentSchemas
    };
    // One location table per quadrant, indexed by an entity id's low 2 bits.
    // Each table owns a disjoint id space (quadrant packed into the low bits),
    // so an entity id alone names its quadrant.
    const locationTables = Array.from({ length: QUADRANT_COUNT }, (_, quadrant) => createEntityLocationTable(16, quadrant));
    const getLocationTable = (entity: Entity) => locationTables[quadrantOf(entity)]!;
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
        Include extends StringKeyof<C & OptionalComponents>,
    >(
        include: readonly Include[] | ReadonlySet<string>,
        options?: ArchetypeQueryOptions<C>
    ): readonly Archetype<Pick<C & OptionalComponents, Include>>[] => {
        const includeArray = Array.from(include);
        const where = options?.where as Record<string, unknown> | undefined;
        const results: Archetype<Pick<C & OptionalComponents, Include>>[] = [];
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
                results.push(archetype as unknown as Archetype<Pick<C & OptionalComponents, Include>>);
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
        // `id` is never a declared component — callers name only real components,
        // and the public `ensureArchetype` type rejects "id". The id COLUMN is
        // added structurally below (to the schema map), never to this name list or
        // the identity key. `id` can still appear in `componentNames` when a
        // snapshot restore replays the serialized component set; the key filters it
        // and the schema loop skips it, so a restore resolves the same archetype a
        // fresh `ensureArchetype([...])` would.
        const namesArr = Array.from(componentNames);
        const sorted = namesArr.filter((n) => n !== ID).sort();
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
        // Every archetype carries the implicit `id` column. Seed the schema with it
        // structurally — this is the id column's definition, not a component the
        // caller asked for.
        const archetypeComponentSchemas: Record<string, Schema> = { [ID]: componentSchemas[ID] };
        let isNonPersistent = false;
        let isNonShared = false;
        for (const comp of namesArr) {
            if (comp === ID) continue;
            if (comp === "nonPersistent") isNonPersistent = true;
            if (comp === "nonShared") isNonShared = true;
            const base = componentSchemas[comp as StringKeyof<typeof componentSchemas>];
            archetypeComponentSchemas[comp] = isPartition(comp)
                ? { ...base, const: partitionValues![comp] }
                : base;
        }
        const archetype = ARCHETYPE.createArchetype(
            archetypeComponentSchemas as any,
            id,
            locationTables[quadrantFor(isNonPersistent, isNonShared)]!
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
        return getLocationTable(entity).locate(entity);
    }

    // Build an entity's value record, excluding the always-present `id` column.
    // `read(entity)` is handed the id already, so echoing it back is redundant —
    // and `id` is the entity's identity (the key), not one of its component
    // values. Single forward pass over the columns (never add-then-delete), so
    // this stays as cheap as a full-row copy minus one field on this hot path.
    const readRowExcludingId = (
        archetype: { columns: { readonly [k: string]: { get(row: number): unknown } } },
        row: number,
    ): Record<string, unknown> => {
        const values: Record<string, unknown> = {};
        for (const name in archetype.columns) {
            if (name === ID) continue;
            values[name] = archetype.columns[name]!.get(row);
        }
        return values;
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
        // Full read (and the archetype-gated read): return the entity's component
        // values WITHOUT `id` (see readRowExcludingId).
        return readRowExcludingId(archetype, location.row);
    }

    const deleteEntity = (entity: Entity): Entity | undefined => {
        const locationTable = getLocationTable(entity);
        const location = locationTable.locate(entity);
        if (location !== null) {
            const archetype = archetypes[location.archetype];
            if (!archetype) {
                throw new Error("Archetype not found: " + JSON.stringify(location));
            }
            const swapped = ARCHETYPE.deleteRow(archetype, location.row, locationTable);
            locationTable.delete(entity);
            return swapped;
        }
        return undefined;
    }

    const updateEntity = (entity: Entity, components: EntityUpdateValues<C>): Entity | undefined => {
        const currentLocation = locateInternal(entity);
        if (currentLocation === null) {
            throw new Error(`Entity not found ${entity}`);
        }
        if ("nonPersistent" in components) {
            throw new Error("Cannot update nonPersistent component");
        }
        if ("nonShared" in components) {
            throw new Error("Cannot update nonShared component");
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
            const swapped = ARCHETYPE.deleteRow(currentArchetype, currentLocation.row, currentLocationTable);
            const newRow = addRow(newArchetype, { ...currentData, ...components });
            // update the entity location table for the entity so it points to the new archetype and row
            currentLocationTable.update(entity, { archetype: newArchetype.id, row: newRow });
            return swapped;
        } else {
            updateRow(newArchetype, currentLocation.row, components as any);
            return undefined;
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
        for (const table of locationTables) {
            table.reset();
        }
        for (const archetype of archetypes) {
            archetype.rowCount = 0;
        }
    };

    // The persistent quadrants a toData/fromData operates on. Omitted scope ⇒
    // all persistent quadrants (whole-database behavior).
    const scopeQuadrants = (scope?: PersistenceScope): number[] => {
        if (scope === undefined) {
            return locationTables.map((_, quadrant) => quadrant).filter(isPersistentQuadrant);
        }
        const quadrants: number[] = [];
        if (scope.shared) quadrants.push(quadrantFor(false, false));
        if (scope.nonShared) quadrants.push(quadrantFor(false, true));
        return quadrants;
    };
    const archetypeQuadrant = (archetype: Archetype<any>): number =>
        quadrantFor(archetype.components.has("nonPersistent"), archetype.components.has("nonShared"));

    // Component names whose SCHEMA is marked `nonPersistent` (distinct from the
    // built-in `nonPersistent`/`nonShared` marker components). Their column data
    // is never serialized; on load each is reconstructed — reset to its schema
    // default, or (when it has no default) stripped from the entity entirely.
    const nonPersistentComponents = (): Set<string> => {
        const names = new Set<string>();
        for (const name in componentSchemas) {
            if (name === ID || name === "nonPersistent" || name === "nonShared") continue;
            if ((componentSchemas as Record<string, Schema>)[name]?.nonPersistent === true) names.add(name);
        }
        return names;
    };

    // After a restore, put nonPersistent columns back into a valid state for the
    // archetypes whose data was just loaded (their nonPersistent columns were
    // omitted from the snapshot and rebuilt empty by archetype.fromData).
    const reconstructNonPersistentColumns = (restored: readonly Archetype<any>[]): void => {
        const nonPersistent = nonPersistentComponents();
        if (nonPersistent.size === 0) return;
        // An `undefined` default (explicit, or an absent `default` key) means
        // "no usable default" — including the type-only-placeholder pattern
        // `{ default: undefined as unknown as GPUBuffer }` — so the component is
        // stripped on load. Every real value is retained and reset, INCLUDING
        // `null` (a valid value) and falsy values like 0, false, "".
        const noDefault = new Set<string>();
        for (const name of nonPersistent) {
            if ((componentSchemas as Record<string, Schema>)[name]!.default === undefined) noDefault.add(name);
        }
        // Defaulted nonPersistent columns → reset every row to the schema default.
        for (const archetype of restored) {
            for (const name of nonPersistent) {
                if (noDefault.has(name) || !archetype.components.has(name)) continue;
                const column = archetype.columns[name]!;
                const def = (componentSchemas as Record<string, Schema>)[name]!.default;
                for (let row = 0; row < archetype.rowCount; row++) column.set(row, def);
            }
        }
        // No-default nonPersistent components → strip them so the entity restores
        // without the component (a system re-adds it on demand). Uses the normal
        // remove-component migration, which naturally merges into reduced archetypes.
        if (noDefault.size > 0) {
            for (const archetype of restored) {
                const present = [...noDefault].filter((n) => archetype.components.has(n));
                if (present.length === 0) continue;
                while (archetype.rowCount > 0) {
                    // A FRESH removal object per pass: core.update deletes the
                    // `undefined` keys from the object it is handed (reusing it as
                    // the migrated row's data), so a shared object would empty out
                    // after the first row and the loop would never terminate.
                    const removal = Object.fromEntries(present.map((n) => [n, undefined])) as EntityUpdateValues<C>;
                    updateEntity(archetype.columns[ID]!.get(0), removal);
                }
            }
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
        reconstructNonPersistentColumns: () => reconstructNonPersistentColumns(archetypes),
        toData: (options?: ToDataOptions): SerializedCore => {
            const { copy = false, scope } = options ?? {};
            const inScope = new Set(scopeQuadrants(scope));
            // nonPersistent-schema components are never written; their column
            // data is omitted and reconstructed on load.
            const omit = nonPersistentComponents();
            return {
                version: ECS_SNAPSHOT_VERSION,
                componentSchemas,
                // Serialize the in-scope persistent quadrants' location tables.
                entityLocationTables: Object.fromEntries(
                    locationTables.flatMap((table, quadrant) =>
                        inScope.has(quadrant) ? [[quadrant, table.toData(copy)]] : []),
                ),
                // Every archetype contributes a structural entry so its id (this
                // array index, stored by value in the location tables) is
                // reproduced on load — this is why a scoped snapshot can still be
                // loaded without shifting ids. Only in-scope (persistent) quadrant
                // archetypes carry `data`; everything else is structure only.
                archetypesData: archetypes.map((archetype): SerializedArchetype => {
                    const componentNames = [...archetype.components];
                    const partitionNames = partitionNamesIn(componentNames.slice().sort());
                    const partitionValues = partitionNames.length > 0
                        ? Object.fromEntries(partitionNames.map((n) => [n, archetype.columns[n]!.get(0)]))
                        : undefined;
                    return inScope.has(archetypeQuadrant(archetype))
                        ? { componentNames, partitionValues, data: archetype.toData(copy, omit) }
                        : { componentNames, partitionValues };
                })
            };
        },
        fromData: (data: SerializedCore, scope?: PersistenceScope) => {
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
            // Component schemas are adopted per-restored-archetype below (not
            // wholesale here), so a schema no restored data uses does not
            // round-trip, and the loading store's own declared schema always
            // wins over the snapshot's.
            // A whole-database load (no scope) also reverts the non-persistent
            // quadrants to defaults, so the loading store's pre-load transient
            // values don't leak across the load. A scoped load is surgical: it
            // touches only its persistent quadrant(s) and leaves everything else
            // — other persistent quadrants and the transient ones — alone.
            if (scope === undefined) {
                for (let quadrant = 0; quadrant < QUADRANT_COUNT; quadrant++) {
                    if (!isPersistentQuadrant(quadrant)) locationTables[quadrant]!.reset();
                }
                for (const archetype of archetypes) {
                    if (archetype.components.has("nonPersistent")) {
                        archetype.rowCount = 0;
                    }
                }
            }
            // Resolve the persisted (non-empty) archetypes BEFORE touching the
            // location tables. resolveArchetype is identity-keyed (component names
            // + partition values), not position-keyed, so a persisted archetype's
            // array position at save time (its serialized id) can resolve to a
            // *different* live id now — e.g. a schema change added, removed, or
            // reordered an archetype relative to this one. `archetypeIdMap[oldId]`
            // is that archetype's current id (or a placeholder for a skipped empty
            // one); the location tables restore through it below so a stale
            // save-time id never lands in the live table.
            const archetypeIdMap: number[] = [];
            const restoredArchetypes: Archetype<any>[] = [];
            const snapshotSchemas = data.componentSchemas as Record<string, Schema>;
            const liveSchemas = componentSchemas as Record<string, Schema>;
            for (const { componentNames, partitionValues, data: archetypeData } of data.archetypesData) {
                // Skip empty archetypes. An archetype with no rows is referenced
                // by no location-table entry, so the remap never needs its id, and
                // recreating it would resurrect structural residue — the empty
                // archetypes a prior `pruneToSchema` left behind, or any archetype
                // no live data uses. A still-needed (declared) archetype is
                // recreated on demand. The id map keeps a placeholder so later,
                // non-empty positions still translate correctly.
                const rowCount = archetypeData === undefined
                    ? 0
                    : (archetypeData as { rowCount?: number }).rowCount ?? 0;
                if (rowCount === 0) {
                    archetypeIdMap.push(-1);
                    continue;
                }
                // Adopt component schemas ONLY for components this restored data
                // actually carries, and only when the loading store hasn't already
                // declared them (its own schema wins). Unknown-but-populated
                // components are preserved losslessly; unknown-and-unused schemas
                // simply fall away instead of round-tripping forever.
                for (const name of componentNames) {
                    if (!(name in liveSchemas) && snapshotSchemas[name] !== undefined) {
                        liveSchemas[name] = snapshotSchemas[name]!;
                    }
                }
                // resolveArchetype (not the public ensureArchetype) so a
                // partition archetype restores as its concrete value-child.
                const archetype = resolveArchetype(componentNames, partitionValues);
                archetypeIdMap.push(archetype.id);
                archetype.fromData(archetypeData);
                restoredArchetypes.push(archetype as unknown as Archetype<any>);
            }
            for (const quadrant of scopeQuadrants(scope)) {
                const restored = data.entityLocationTables[quadrant];
                // Restore the quadrant's table, or reset it if the snapshot
                // carried no entities for it. When any archetype resolved to a
                // different id than its serialized position (schema change), the
                // stored ids are translated first; with no archetypes to map
                // (e.g. a persistence-layer table already carrying live ids) the
                // snapshot is restored verbatim.
                if (restored !== undefined) {
                    locationTables[quadrant]!.fromData(
                        archetypeIdMap.length > 0
                            ? remapSerializedArchetypeIds(restored, archetypeIdMap)
                            : restored,
                    );
                } else {
                    locationTables[quadrant]!.reset();
                }
            }
            // The archetypes just loaded had their nonPersistent columns omitted
            // and rebuilt empty; put those columns back into a valid state.
            reconstructNonPersistentColumns(restoredArchetypes);
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