// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Entity } from "../../entity/entity.js";
import { Archetype, ReadonlyArchetype, Router } from "../../archetype/archetype.js";
import { Schema } from "../../../schema/index.js";
import { RequiredComponents } from "../../required-components.js";
import { StringKeyof } from "../../../types/index.js";
import { Components } from "../components.js";
import { OptionalComponents } from "../../optional-components.js";
import { HasPartitionKey } from "../partition.js";

export type EntityValues<C> = { readonly [K in (RequiredComponents & StringKeyof<C & OptionalComponents>)]: (C & OptionalComponents)[K] }
export type EntityReadValues<C> = RequiredComponents & { readonly [K in StringKeyof<C & OptionalComponents> as string extends K ? never : K]?: (C & OptionalComponents)[K] }
export type EntityUpdateValues<C> = Partial<Omit<C, "id">>;

export type ArchetypeQueryOptions<C extends object, PK extends string = never> = {
    exclude?: readonly StringKeyof<C & OptionalComponents>[];
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
        Include extends StringKeyof<C & RequiredComponents & OptionalComponents>,
    >(
        include: readonly Include[] | ReadonlySet<string>,
        options?: ArchetypeQueryOptions<C, PK>
    ): readonly ReadonlyArchetype<RequiredComponents & Pick<C & RequiredComponents & OptionalComponents, Include>>[];
    // No partition value → a concrete ReadonlyArchetype unless the key set
    // includes a partition component, in which case a Router (write-only).
    ensureArchetype<const CC extends StringKeyof<C & RequiredComponents & OptionalComponents>>(
        components: readonly CC[] | ReadonlySet<CC>,
    ): HasPartitionKey<CC, PK> extends true
        ? Router<RequiredComponents & { [K in CC]: (C & RequiredComponents & OptionalComponents)[K] }>
        : ReadonlyArchetype<RequiredComponents & { [K in CC]: (C & RequiredComponents & OptionalComponents)[K] }>;
    // Partition value(s) supplied → the concrete value-child, always.
    ensureArchetype<const CC extends StringKeyof<C & RequiredComponents & OptionalComponents>>(
        components: readonly CC[] | ReadonlySet<CC>,
        partitionValues: { readonly [K in Extract<CC, PK>]: (C & RequiredComponents & OptionalComponents)[K] },
    ): ReadonlyArchetype<RequiredComponents & { [K in CC]: (C & RequiredComponents & OptionalComponents)[K] }>;

    locate: (entity: Entity) => { archetype: ReadonlyArchetype<RequiredComponents>, row: number } | null;
    read<T extends RequiredComponents>(entity: Entity, minArchetype: ReadonlyArchetype<T> | Archetype<T>): Readonly<T> & EntityReadValues<C> | null;
    read(entity: Entity): EntityReadValues<C> | null;
    get<K extends StringKeyof<C>>(entity: Entity, component: K): C[K] | undefined;
    /**
     * Serialize the core. When `copy` is true the snapshot is detached from the
     * live store (column and entity buffers are copied) so it survives later
     * mutation; otherwise it references live buffers — faster, but only valid
     * until the next mutation. See {@link Store.toData} bug notes.
     */
    toData(copy?: boolean): unknown
}

/**
 * This is the main interface for the low level ECS Core.
 */
export interface Core<
    C extends Components = never,
    PK extends string = never,
> extends ReadonlyCore<C, PK> {
    queryArchetypes<
        Include extends StringKeyof<C & RequiredComponents & OptionalComponents>,
    >(
        include: readonly Include[] | ReadonlySet<string>,
        options?: ArchetypeQueryOptions<C, PK>
    ): readonly Archetype<RequiredComponents & Pick<C & RequiredComponents & OptionalComponents, Include>>[];
    ensureArchetype<const CC extends StringKeyof<C & RequiredComponents & OptionalComponents>>(
        components: readonly CC[] | ReadonlySet<CC>,
    ): HasPartitionKey<CC, PK> extends true
        ? Router<RequiredComponents & { [K in CC]: (C & RequiredComponents & OptionalComponents)[K] }>
        : Archetype<RequiredComponents & { [K in CC]: (C & RequiredComponents & OptionalComponents)[K] }>;
    ensureArchetype<const CC extends StringKeyof<C & RequiredComponents & OptionalComponents>>(
        components: readonly CC[] | ReadonlySet<CC>,
        partitionValues: { readonly [K in Extract<CC, PK>]: (C & RequiredComponents & OptionalComponents)[K] },
    ): Archetype<RequiredComponents & { [K in CC]: (C & RequiredComponents & OptionalComponents)[K] }>;
    locate: (entity: Entity) => { archetype: Archetype<RequiredComponents>, row: number } | null;
    delete: (entity: Entity) => void;
    update: (entity: Entity, values: EntityUpdateValues<C>) => void;
    compact: () => void;
    /** Wipe all entities. O(num_archetypes). Location tables and row counts reset to empty. */
    reset(): void;
    fromData(data: unknown): void
}
