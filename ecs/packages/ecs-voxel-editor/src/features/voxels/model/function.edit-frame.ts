// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, Mat4x4, type Vec3 } from "@adobe/ecs";
import { chainOf } from "./function.chain-of.js";
import { instanceMatrix } from "./function.instance-matrix.js";
import type { Editing } from "./type.editing.js";
import type { Lookups } from "./type.lookups.js";

/**
 * The model being edited, its size and voxels' scale, and the matrix taking its voxels to the world, from its root down
 * through the instances entered; null where there's no model to edit. Editing that no longer holds together, as when an
 * instance entered is gone, falls back to editing `main`.
 */
export const editFrame = (editing: Editing | null, main: Entity, lookups: Lookups): { readonly model: Entity; readonly size: Vec3; readonly scale: Vec3; readonly toWorld: Mat4x4 } | null => {
    const fallback = (): ReturnType<typeof editFrame> => {
        const top = lookups.model(main);
        return top === null ? null : { model: main, size: top.size, scale: top.scale, toWorld: Mat4x4.scaling(top.scale[0], top.scale[1], top.scale[2]) };
    };
    const root = editing === null ? null : lookups.model(editing.root);
    if (editing === null || root === null) return fallback();
    let toWorld = Mat4x4.scaling(root.scale[0], root.scale[1], root.scale[2]);
    let holder = editing.root;
    let held = root;
    for (const link of chainOf(editing)) {
        const placed = lookups.instance(link);
        const inner = placed === null ? null : lookups.model(placed.of);
        if (placed === null || inner === null || placed.parent !== holder) return fallback();
        toWorld = Mat4x4.multiply(toWorld, instanceMatrix(placed.position, placed.rotation, inner.scale, held.scale));
        holder = placed.of;
        held = inner;
    }
    return { model: holder, size: held.size, scale: held.scale, toWorld };
};
