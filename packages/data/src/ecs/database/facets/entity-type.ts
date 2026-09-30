// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ComponentSchemas } from "../../component-schemas.js";
import type { OptionalComponents } from "../../optional-components.js";
import type { ToType } from "../../../schema/to-type.js";
import type { StringKeyof } from "../../../types/types.js";
import type { EntityComponents } from "./entity-components.js";

/**
 * The value type of an entity declared by component tuple `A`: the aggregate of its
 * component types. The built-in marker components are omitted (they carry no
 * data); tags (`True.schema` components) are kept.
 */
export type EntityType<C extends ComponentSchemas, A extends EntityComponents<C>> = {
    readonly [K in Exclude<A[number], StringKeyof<OptionalComponents>>]: ToType<C[K]>;
};
