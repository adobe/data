// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec3 } from "@adobe/ecs";

/**
 * The face a ray, `origin + t * direction` in a model's voxels, reaches first in a model of `size` voxels: the side
 * facing the ray of the first filled cell, `filled` saying which are, with the ray's `t` there; or, where it reaches
 * none, with `walls`, the far wall it leaves through, the side facing in of the cell beyond it, `wall` true. Null for a
 * ray that misses the model, or leaves it without `walls`.
 */
export const castRay = (
    ray: { readonly origin: Vec3; readonly direction: Vec3 },
    size: Vec3,
    filled: (x: number, y: number, z: number) => boolean,
    walls = true,
): { readonly cell: Vec3.I32; readonly side: number; readonly t: number; readonly wall: boolean } | null => {
    const { origin, direction } = ray;
    let near = 0;
    let far = Infinity;
    let entered = -1;
    for (let axis = 0; axis < 3; axis++) {
        const o = origin[axis] ?? 0;
        const d = direction[axis] ?? 0;
        const extent = size[axis] ?? 0;
        if (d === 0) {
            if (o < 0 || o > extent) return null;
            continue;
        }
        const a = -o / d;
        const b = (extent - o) / d;
        const low = Math.min(a, b);
        if (low > near) {
            near = low;
            entered = axis;
        }
        far = Math.min(far, Math.max(a, b));
    }
    if (near > far) return null;
    const cell: [number, number, number] = [0, 0, 0];
    const step: [number, number, number] = [0, 0, 0];
    const next: [number, number, number] = [Infinity, Infinity, Infinity];
    const delta: [number, number, number] = [Infinity, Infinity, Infinity];
    for (let axis = 0; axis < 3; axis++) {
        const o = origin[axis] ?? 0;
        const d = direction[axis] ?? 0;
        const extent = size[axis] ?? 0;
        cell[axis] = Math.min(Math.max(Math.floor(o + d * near), 0), extent - 1);
        step[axis] = Math.sign(d);
        if (d !== 0) {
            next[axis] = (cell[axis] + (d > 0 ? 1 : 0) - o) / d;
            delta[axis] = Math.abs(1 / d);
        }
    }
    // A ray starting in a filled cell is said to reach it through the side it faces most.
    let axis = entered >= 0 ? entered : dominant(direction);
    const limit = (size[0] ?? 0) + (size[1] ?? 0) + (size[2] ?? 0) + 3;
    let t = near;
    for (let i = 0; i < limit; i++) {
        if (filled(cell[0], cell[1], cell[2])) return { cell: [cell[0], cell[1], cell[2]], side: sideFacing(axis, step[axis]), t, wall: false };
        axis = next[0] <= next[1] && next[0] <= next[2] ? 0 : next[1] <= next[2] ? 1 : 2;
        t = next[axis];
        cell[axis] += step[axis];
        next[axis] += delta[axis];
        if (cell[axis] < 0 || cell[axis] >= (size[axis] ?? 0)) return walls ? { cell: [cell[0], cell[1], cell[2]], side: sideFacing(axis, step[axis]), t, wall: true } : null;
    }
    return null;
};

/** The side along `axis` facing back against a ray stepping `step` along it. */
const sideFacing = (axis: number, step: number): number => axis * 2 + (step > 0 ? 1 : 0);

/** The axis a direction is most along. */
const dominant = (direction: Vec3): number => {
    const [x, y, z] = [Math.abs(direction[0] ?? 0), Math.abs(direction[1] ?? 0), Math.abs(direction[2] ?? 0)];
    return x >= y && x >= z ? 0 : y >= z ? 1 : 2;
};
