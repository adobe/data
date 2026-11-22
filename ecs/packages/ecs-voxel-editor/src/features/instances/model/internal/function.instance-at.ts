// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, Mat4x4, type Vec3 } from "@adobe/ecs";
import { castRay, instanceMatrix, rayInto, type Lookups } from "../../../voxels/model/index.js";

/**
 * The instance placed directly in the edited model, `frame`, whose voxels, or whose instances' however deep, the world
 * ray reaches first, nearer than the edited model's own voxels; null for none.
 */
export const instanceAt = (
    ray: { readonly origin: Vec3; readonly direction: Vec3 },
    frame: { readonly model: Entity; readonly size: Vec3; readonly scale: Vec3; readonly toWorld: Mat4x4 },
    lookups: Lookups & { readonly instancesIn: (model: Entity) => readonly Entity[]; readonly filled: (model: Entity, cell: Vec3) => boolean },
): Entity | null => {
    /** The nearest `t` at which the ray reaches `model`'s voxels or its instances', drawn through `toWorld`. */
    const reach = (model: Entity, size: Vec3, scale: Vec3, toWorld: Mat4x4, depth: number): number => {
        const own = castRay(rayInto(ray, toWorld), size, (x, y, z) => lookups.filled(model, [x, y, z]), false)?.t ?? Infinity;
        if (depth >= 8) return own;
        let nearest = own;
        for (const each of lookups.instancesIn(model)) {
            const placed = lookups.instance(each);
            const inner = placed === null ? null : lookups.model(placed.of);
            if (placed === null || inner === null) continue;
            const matrix = Mat4x4.multiply(toWorld, instanceMatrix(placed.position, placed.rotation, inner.scale, scale));
            nearest = Math.min(nearest, reach(placed.of, inner.size, inner.scale, matrix, depth + 1));
        }
        return nearest;
    };
    const own = castRay(rayInto(ray, frame.toWorld), frame.size, (x, y, z) => lookups.filled(frame.model, [x, y, z]), false)?.t ?? Infinity;
    let found: Entity | null = null;
    let nearest = own;
    for (const each of lookups.instancesIn(frame.model)) {
        const placed = lookups.instance(each);
        const inner = placed === null ? null : lookups.model(placed.of);
        if (placed === null || inner === null) continue;
        const matrix = Mat4x4.multiply(frame.toWorld, instanceMatrix(placed.position, placed.rotation, inner.scale, frame.scale));
        const t = reach(placed.of, inner.size, inner.scale, matrix, 1);
        if (t < nearest) {
            nearest = t;
            found = each;
        }
    }
    return found;
};
