// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Normalize `n` in place and flip it so it opposes the ray direction
 * `(dx,dy,dz)` — the standard picking convention (the returned normal points
 * back toward the ray origin, i.e. outward from the hit surface).
 *
 * Unifies the normal convention across engines and across ray-cast vs.
 * shape-cast, whose raw normals (surface normal, contact normal, penetration
 * axis) don't otherwise agree on sign. A zero-length input is left as the zero
 * vector (guarded so a degenerate hit doesn't divide by zero).
 */
export const orientNormalAgainstRay = (n: [number, number, number], dx: number, dy: number, dz: number): void => {
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len === 0) return;
    n[0] /= len; n[1] /= len; n[2] /= len;
    if (n[0] * dx + n[1] * dy + n[2] * dz > 0) { n[0] = -n[0]; n[1] = -n[1]; n[2] = -n[2]; }
};
