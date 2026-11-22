// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, Mat4x4 } from "@adobe/ecs";
import { instanceMatrix } from "./function.instance-matrix.js";
import type { Lookups } from "./type.lookups.js";

/**
 * Where every model is drawn, from `top` down through the instances placed in each: each model with the matrix taking
 * its voxels to the world, once per place it appears. A model placed within itself, however deeply, is drawn once at
 * the depth it recurs, and nesting stops at `depth`.
 */
export const placements = (top: Entity, lookups: Lookups & { readonly instancesIn: (model: Entity) => readonly Entity[] }, depth = 8): { readonly model: Entity; readonly toWorld: Mat4x4 }[] => {
    const found: { readonly model: Entity; readonly toWorld: Mat4x4 }[] = [];
    const root = lookups.model(top);
    if (root === null) return found;
    const visit = (model: Entity, scale: readonly [number, number, number], toWorld: Mat4x4, path: ReadonlySet<Entity>): void => {
        found.push({ model, toWorld });
        if (path.size >= depth) return;
        for (const each of lookups.instancesIn(model)) {
            const placed = lookups.instance(each);
            const inner = placed === null ? null : lookups.model(placed.of);
            if (placed === null || inner === null || path.has(placed.of)) continue;
            const matrix = Mat4x4.multiply(toWorld, instanceMatrix(placed.position, placed.rotation, inner.scale, scale));
            visit(placed.of, [inner.scale[0], inner.scale[1], inner.scale[2]], matrix, new Set([...path, placed.of]));
        }
    };
    visit(top, [root.scale[0], root.scale[1], root.scale[2]], Mat4x4.scaling(root.scale[0], root.scale[1], root.scale[2]), new Set([top]));
    return found;
};
