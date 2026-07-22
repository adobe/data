// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ComponentSchemas } from "../../component-schemas.js";

/**
 * Declare a feature's archetypes, validating every key against `components` and
 * preserving each archetype's literal key tuple (via a `const` type parameter),
 * so no per-archetype `as const satisfies` is needed. `components` is passed as
 * a value (it is imported anyway) because TypeScript can't infer the tuple type
 * while a component-type argument is also supplied explicitly.
 *
 * ```ts
 * export const archetypes = Database.archetypes(components, {
 *     Todo: ["todo", "name", "complete", "order", "dragPosition", "assignees"],
 * });
 * ```
 */
export function archetypes<
    C extends ComponentSchemas,
    const A extends { readonly [name: string]: readonly (keyof C & string)[] },
>(_components: C, map: A): A {
    // `_components` carries the component type C for key validation; unused at runtime.
    return map;
}
