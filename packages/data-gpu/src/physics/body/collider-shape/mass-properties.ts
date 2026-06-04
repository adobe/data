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
    if (shape === "capsule") {
        // Y-aligned: radius r = hx, cylinder half-height = hy (length L = 2·hy).
        // A cylinder plus two hemispheres (together one sphere of radius r).
        const r = hx, L = 2 * hy;
        const mc = density * Math.PI * r * r * L;          // cylinder
        const ms = density * (4 / 3) * Math.PI * r * r * r; // two hemispheres = a sphere
        const mass = mc + ms;
        // axial (Y): cylinder ½mc r² + sphere ⅖ms r²
        const iy = 0.5 * mc * r * r + 0.4 * ms * r * r;
        // transverse (X = Z): cylinder about centre, plus each hemisphere's own
        // inertia (83/320·mh r²) shifted by parallel axis to the capsule centre
        // (COM offset L/2 + 3r/8). See standard capsule-inertia derivation.
        const d = L / 2 + 3 * r / 8;
        const ix = mc * (L * L / 12 + r * r / 4) + ms * ((83 / 320) * r * r + d * d);
        outInvInertia[o] = 1 / ix; outInvInertia[o + 1] = 1 / iy; outInvInertia[o + 2] = 1 / ix;
        return 1 / mass;
    }
    // sphere — radius in hx
    const mass = density * (4 / 3) * Math.PI * hx * hx * hx;
    const inv = 1 / (0.4 * mass * hx * hx);
    outInvInertia[o] = inv; outInvInertia[o + 1] = inv; outInvInertia[o + 2] = inv;
    return 1 / mass;
}
