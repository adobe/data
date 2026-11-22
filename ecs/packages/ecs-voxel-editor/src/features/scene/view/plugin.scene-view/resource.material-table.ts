// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/ecs";

/**
 * The materials as the GPU reads them: each material's slot, and the table's values, eight floats a slot: its linear
 * color and metallic, then its roughness. Replaced as the materials change.
 */
export const materialTable = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [materialTable]: { type: { readonly slots: ReadonlyMap<Entity, number>; readonly values: readonly number[] } | null; thread: "world" };
    }
}
