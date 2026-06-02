// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { ColliderShape } from "./collider-shape.js";

/**
 * Mass + diagonal inverse inertia for a shape of the given half-extents and
 * density. The per-shape formulas live here (with the type) rather than leaking
 * the shape members into the solver. Allocation-free: the diagonal inverse
 * inertia is written into `outInvInertia[o..o+2]` and the inverse mass returned
 * (this runs per dynamic body per frame in the solver gather). Density comes
 * from the body's material.
 */
export function massProperties(
    shape: ColliderShape, hx: number, hy: number, hz: number, density: number,
    outInvInertia: Float32Array, o: number,
): number {
    if (shape === "box") {
        const mass = density * 8 * hx * hy * hz;
        const ix = (mass / 3) * (hy * hy + hz * hz);
        const iy = (mass / 3) * (hx * hx + hz * hz);
        const iz = (mass / 3) * (hx * hx + hy * hy);
        outInvInertia[o] = 1 / ix; outInvInertia[o + 1] = 1 / iy; outInvInertia[o + 2] = 1 / iz;
        return 1 / mass;
    }
    // sphere — radius in hx
    const mass = density * (4 / 3) * Math.PI * hx * hx * hx;
    const inv = 1 / (0.4 * mass * hx * hx);
    outInvInertia[o] = inv; outInvInertia[o + 1] = inv; outInvInertia[o + 2] = inv;
    return 1 / mass;
}
