// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Entity } from "../../entity.js";
import { Archetype, ReadonlyArchetype } from "../../archetype/archetype.js";
import { Schema } from "../../../schema/index.js";
import { RequiredComponents } from "../../required-components.js";
import { StringKeyof } from "../../../types/index.js";
import { Components } from "../components.js";
import { OptionalComponents } from "../../optional-components.js";

export type EntityValues<C> = { readonly [K in (RequiredComponents & StringKeyof<C & OptionalComponents>)]: (C & OptionalComponents)[K] }
export type EntityReadValues<C> = RequiredComponents & { readonly [K in StringKeyof<C & OptionalComponents>]?: (C & OptionalComponents)[K] }
export type EntityUpdateValues<C> = Partial<Omit<C, "id">>;

export type ArchetypeQueryOptions<C extends object> =
    { exclude?: readonly StringKeyof<C & OptionalComponents>[] };
export interface ReadonlyCore<
    C extends Components = never,
> {
    readonly componentSchemas: { readonly [K in StringKeyof<C & RequiredComponents & OptionalComponents>]: Schema };

    queryArchetypes<
        Include extends StringKeyof<C & RequiredComponents & OptionalComponents>,
    >(
        include: readonly Include[] | ReadonlySet<string>,
        options?: ArchetypeQueryOptions<C>
    ): readonly ReadonlyArchetype<RequiredComponents & Pick<C & RequiredComponents & OptionalComponents, Include>>[];
    ensureArchetype: <const CC extends StringKeyof<C & RequiredComponents & OptionalComponents>>(
        components: readonly CC[] | ReadonlySet<CC>
    ) => ReadonlyArchetype<RequiredComponents & { [K in CC]: (C & RequiredComponents & OptionalComponents)[K] }>;

    locate: (entity: Entity) => { archetype: ReadonlyArchetype<RequiredComponents>, row: number } | null;
    read<T extends RequiredComponents>(entity: Entity, minArchetype: ReadonlyArchetype<T> | Archetype<T>): { readonly [K in (StringKeyof<RequiredComponents & T>)]: (RequiredComponents & T)[K] } & EntityReadValues<C> | null;
    read(entity: Entity): RequiredComponents & { readonly [K in (StringKeyof<C & OptionalComponents>)]?: (OptionalComponents & C)[K] } | null;
    get<K extends StringKeyof<C>>(entity: Entity, component: K): C[K] | undefined;
    toData(): unknown
}

/**
 * This is the main interface for the low level ECS Core.
 */
export interface Core<
    C extends Components = never,
> extends ReadonlyCore<C> {
    queryArchetypes<
        Include extends StringKeyof<C & RequiredComponents & OptionalComponents>,
    >(
        include: readonly Include[] | ReadonlySet<string>,
        options?: ArchetypeQueryOptions<C>
    ): readonly Archetype<RequiredComponents & Pick<C & RequiredComponents & OptionalComponents, Include>>[];
    ensureArchetype: <const CC extends StringKeyof<C & RequiredComponents & OptionalComponents>>(
        components: readonly CC[] | ReadonlySet<CC>
    ) => Archetype<RequiredComponents & { [K in CC]: (C & RequiredComponents & OptionalComponents)[K] }>;
    locate: (entity: Entity) => { archetype: Archetype<RequiredComponents>, row: number } | null;
    delete: (entity: Entity) => void;
    update: (entity: Entity, values: EntityUpdateValues<C>) => void;
    compact: () => void;
    fromData(data: unknown): void
}
