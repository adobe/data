// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ComponentSchemas } from "../../component-schemas.js";
import type { OptionalComponents } from "../../optional-components.js";
import type { StringKeyof } from "../../../types/types.js";

/**
 * The component-name tuple that declares an entity: any of the feature's
 * components, plus the built-in `nonPersistent` / `nonShared` marker components
 * that place the entity in a scope quadrant.
 *
 * ```ts
 * export const Todo = ["name", "complete", "order"] as const satisfies Database.EntityComponents<typeof components>;
 * ```
 */
export type EntityComponents<C extends ComponentSchemas> = readonly (StringKeyof<C> | StringKeyof<OptionalComponents>)[];
