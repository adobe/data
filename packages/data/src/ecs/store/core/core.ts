// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Entity } from "../../entity/entity.js";
import { Archetype, ReadonlyArchetype } from "../../archetype/archetype.js";
import { Schema } from "../../../schema/index.js";
import { RequiredComponents } from "../../required-components.js";
import { StringKeyof } from "../../../types/index.js";
import { Components } from "../components.js";
import { OptionalComponents } from "../../optional-components.js";
import { HasPartitionKey } from "../partition.js";
import { PersistenceScope, ToDataOptions } from "../../persistence-scope.js";

// Entity value shapes deliberately EXCLUDE `id`: the id is the entity's identity
// (the key you already hold when reading), not one of its component values. It
// stays a real column (see the Archetype interface) but is never part of a read.
export type EntityValues<C> = { readonly [K in StringKeyof<C & OptionalComponents>]: (C & OptionalComponents)[K] }
export type EntityReadValues<C> = { readonly [K in StringKeyof<C & OptionalComponents> as string extends K ? never : K]?: (C & OptionalComponents)[K] }
export type EntityUpdateValues<C> = Partial<Omit<C, "id">>;

export type ArchetypeQueryOptions<C extends object, PK extends string = never> = {
    exclude?: readonly StringKeyof<C & RequiredComponents & OptionalComponents>[];
    /**
     * Filter to archetypes whose partition component equals the given value.
     * A partition column is const per archetype, so this is decided at
     * archetype granularity (O(archetypes), no row scan). Keyed to the store's
     * partition components only — a non-partition column is not const per
     * archetype, so a value filter on it is not archetype-decidable.
     */
    where?: { readonly [K in Extract<PK, StringKeyof<C & OptionalComponents>>]?: (C & RequiredComponents & OptionalComponents)[K] };
};
export interface ReadonlyCore<
    C extends Components = never,
    PK extends string = never,
> {
    readonly componentSchemas: { readonly [K in StringKeyof<C & RequiredComponents & OptionalComponents>]: Schema };

    queryArchetypes<
        Include extends StringKeyof<C & OptionalComponents>,
    >(
        include: readonly Include[] | ReadonlySet<string>,
        options?: ArchetypeQueryOptions<C, PK>
    ): readonly ReadonlyArchetype<Pick<C & OptionalComponents, Include>>[];
    // No partition value → a concrete ReadonlyArchetype unless the key set
    // includes a partition component, in which case a Router (write-only).
    ensureArchetype<const CC extends StringKeyof<C & OptionalComponents>>(
        components: readonly CC[] | ReadonlySet<CC>,
    ): HasPartitionKey<CC, PK> extends true
        ? Archetype.Router<{ [K in CC]: (C & OptionalComponents)[K] }>
        : ReadonlyArchetype<{ [K in CC]: (C & OptionalComponents)[K] }>;
    // Partition value(s) supplied → the concrete value-child, always.
    ensureArchetype<const CC extends StringKeyof<C & OptionalComponents>>(
        components: readonly CC[] | ReadonlySet<CC>,
        partitionValues: { readonly [K in Extract<CC, PK>]: (C & OptionalComponents)[K] },
    ): ReadonlyArchetype<{ [K in CC]: (C & OptionalComponents)[K] }>;

    locate: (entity: Entity) => { archetype: ReadonlyArchetype, row: number } | null;
    /**
     * Read exactly the components of `archetype`. A membership GATE: returns
     * `null` unless the entity is a superset of `archetype`. The result is
     * narrowed to the archetype's own row — reading a component outside
     * `archetype` off the result is a compile error (use a wider archetype, the
     * component-list overload, or `read(entity)`).
     */
    read<T>(entity: Entity, archetype: ReadonlyArchetype<T> | Archetype<T>): Readonly<T> | null;
    /**
     * Read a chosen subset of an entity's components.
     *
     * A pure PROJECTION, not a membership gate: returns `null` only when the
     * entity does not exist. A requested component the entity does not have
     * comes back absent — the field stays optional in the result, exactly as
     * from the full `read(entity)`.
     *
     * Prefer this over `read(entity)` when only a few fields are needed: it
     * names the exact components touched, so `db.derive` can scope its
     * recompute to just those fields instead of the whole entity. `id` is not a
     * readable component (you already hold it); the element type is inferred as
     * a literal union.
     */
    read<const K extends StringKeyof<EntityReadValues<C>>>(entity: Entity, components: readonly K[]): Readonly<Pick<EntityReadValues<C>, K>> | null;
    read(entity: Entity): EntityReadValues<C> | null;
    get<K extends StringKeyof<C>>(entity: Entity, component: K): C[K] | undefined;
    /**
     * Serialize the core. When `copy` is true the snapshot is detached from the
     * live store (column and entity buffers are copied) so it survives later
     * mutation; otherwise it references live buffers — faster, but only valid
     * until the next mutation. See {@link Store.toData} bug notes.
     *
     * `options.scope` selects which persistent quadrants to emit (see
     * PersistenceScope); omit it for the whole persistent snapshot.
     */
    toData(options?: ToDataOptions): unknown
}

/**
 * This is the main interface for the low level ECS Core.
 */
export interface Core<
    C extends Components = never,
    PK extends string = never,
> extends ReadonlyCore<C, PK> {
    queryArchetypes<
        Include extends StringKeyof<C & OptionalComponents>,
    >(
        include: readonly Include[] | ReadonlySet<string>,
        options?: ArchetypeQueryOptions<C, PK>
    ): readonly Archetype<Pick<C & OptionalComponents, Include>>[];
    ensureArchetype<const CC extends StringKeyof<C & OptionalComponents>>(
        components: readonly CC[] | ReadonlySet<CC>,
    ): HasPartitionKey<CC, PK> extends true
        ? Archetype.Router<{ [K in CC]: (C & OptionalComponents)[K] }>
        : Archetype<{ [K in CC]: (C & OptionalComponents)[K] }>;
    ensureArchetype<const CC extends StringKeyof<C & OptionalComponents>>(
        components: readonly CC[] | ReadonlySet<CC>,
        partitionValues: { readonly [K in Extract<CC, PK>]: (C & OptionalComponents)[K] },
    ): Archetype<{ [K in CC]: (C & OptionalComponents)[K] }>;
    locate: (entity: Entity) => { archetype: Archetype, row: number } | null;
    /**
     * Deletes the entity. Returns the entity that was swap-moved into the
     * vacated row (a relocation side effect), or `undefined` when the deleted
     * row was the last row. The return is optional info — callers that don't
     * track relocations may ignore it.
     */
    delete: (entity: Entity) => Entity | undefined;
    /**
     * Updates the entity. When the update migrates the entity to another
     * archetype, its old archetype swap-moves a neighbor into the vacated row;
     * that neighbor is returned (or `undefined` for an in-place update with no
     * migration). The migrated entity's own relocation is observable via
     * `locate`. The return is optional info — callers may ignore it.
     */
    update: (entity: Entity, values: EntityUpdateValues<C>) => Entity | undefined;
    compact: () => void;
    /** Wipe all entities. O(num_archetypes). Location tables and row counts reset to empty. */
    reset(): void;
    /**
     * Reconcile nonPersistent-schema columns after an external restore (e.g. a
     * persistence layer that rebuilt the store from disk column-by-column): reset
     * defaulted ones to their schema default and strip no-default ones (the entity
     * migrates out of the component). Idempotent. `fromData` already applies this
     * to its own loads; this is for callers that restore columns another way.
     */
    reconstructNonPersistentColumns(): void;
    /**
     * Restore from a snapshot. With no `scope`, performs a whole-database load
     * (restores both persistent quadrants and resets the non-persistent ones).
     * With a `scope`, restores only the in-scope persistent quadrant(s) and
     * leaves every other quadrant untouched (see PersistenceScope).
     */
    fromData(data: unknown, scope?: PersistenceScope): void
}
