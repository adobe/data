// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { StringKeyof } from "../../types/types.js";
import type { FromSchemas } from "../../schema/from-schemas.js";
import type { ComponentSchemas } from "../component-schemas.js";
import type { ArchetypeComponents } from "./archetype-components.js";
import type { RequiredComponents } from "../required-components.js";
import type { OptionalComponents } from "../optional-components.js";
import type { ReadonlyArchetype } from "../archetype/archetype.js";

/** Schema shape consumed by the archetype-row extractors: component schemas + archetype name-lists. */
export type ArchetypeSchema = {
    readonly components: ComponentSchemas;
    readonly archetypes: ArchetypeComponents<any>;
};

export type ArchetypeRowOf<
    S extends ArchetypeSchema,
    K extends StringKeyof<S["archetypes"]>,
> = RequiredComponents & {
    readonly [Col in S["archetypes"][K][number]]:
        (FromSchemas<S["components"]> & RequiredComponents & OptionalComponents)[Col]
};

export type ArchetypeHandleOf<
    S extends ArchetypeSchema,
    K extends StringKeyof<S["archetypes"]>,
> = ReadonlyArchetype<ArchetypeRowOf<S, K>>;
