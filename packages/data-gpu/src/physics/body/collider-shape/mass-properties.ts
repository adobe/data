// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3 } from "@adobe/data/math";
import type { ColliderShape } from "./collider-shape.js";

export interface MassProperties {
    inverseMass: number;
    /** Diagonal inverse inertia in body-local space. */
    inverseInertia: Vec3;
}

/**
 * Mass + diagonal inertia for a shape of the given size and density. The
 * per-shape formulas live here (with the type) rather than leaking the shape
 * members into the solver. Density comes from the body's material.
 */
export function massProperties(shape: ColliderShape, halfExtents: Vec3, density: number): MassProperties {
    if (shape === "box") {
        const [hx, hy, hz] = halfExtents;
        const mass = density * 8 * hx * hy * hz;
        const ix = (mass / 3) * (hy * hy + hz * hz);
        const iy = (mass / 3) * (hx * hx + hz * hz);
        const iz = (mass / 3) * (hx * hx + hy * hy);
        return { inverseMass: 1 / mass, inverseInertia: [1 / ix, 1 / iy, 1 / iz] };
    }
    // sphere — radius in halfExtents.x
    const r = halfExtents[0];
    const mass = density * (4 / 3) * Math.PI * r * r * r;
    const i = 0.4 * mass * r * r;
    return { inverseMass: 1 / mass, inverseInertia: [1 / i, 1 / i, 1 / i] };
}
