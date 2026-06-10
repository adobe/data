// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3, Quat } from "@adobe/data/math";

/**
 * Fits one capsule collider to each significant bone of a skinned mesh — the
 * per-bone colliders a ragdoll needs (you can't trimesh a deforming skin). Each
 * vertex is assigned to the bone it's *most* weighted to; that bone's vertices
 * are pushed into the bone's bind-local frame (via the joint's inverse-bind
 * matrix) and a capsule is fitted to them: the longest local axis becomes the
 * capsule axis, the perpendicular spread its radius.
 *
 * The result is expressed as a bone-local offset (`offsetPosition` /
 * `offsetRotation`, which orients the Y-aligned capsule onto the fitted axis)
 * plus dimensions — so the capsule's world pose each frame is just
 * `jointWorldMatrix · offset`, tracking the animated skeleton.
 */

/** Skinned vertices in mesh (bind) space: `positions` (xyz triples), `joints`
 *  (4 joint indices/vertex), `weights` (4 weights/vertex). */
export interface SkinVertices {
    positions: Float32Array;
    joints: Uint32Array;
    weights: Float32Array;
}

export interface FitBoneCapsulesInput {
    jointCount: number;
    /** glTF inverse-bind matrices, column-major, `jointCount × 16`. */
    inverseBindMatrices: Float32Array;
    skin: SkinVertices;
    /** A vertex joins a bone only if its dominant weight ≥ this (default 0.5). */
    minWeight?: number;
    /** Bones with fewer assigned vertices than this get no capsule (default 6). */
    minVertices?: number;
}

export interface BoneCapsule {
    jointIndex: number;
    offsetPosition: Vec3; // capsule centre, bone-bind-local
    offsetRotation: Quat; // orients the Y-aligned capsule onto the fitted axis, bone-bind-local
    radius: number;
    halfHeight: number;   // half-length of the cylindrical section
}

/** Transform a point by a column-major 4×4 matrix (slice `o..o+16`), into `out`. */
function transformPoint(m: Float32Array, o: number, x: number, y: number, z: number, out: [number, number, number]): void {
    out[0] = m[o] * x + m[o + 4] * y + m[o + 8] * z + m[o + 12];
    out[1] = m[o + 1] * x + m[o + 5] * y + m[o + 9] * z + m[o + 13];
    out[2] = m[o + 2] * x + m[o + 6] * y + m[o + 10] * z + m[o + 14];
}

/** Shortest-arc quaternion rotating +Y onto unit vector `b`. */
function quatFromY(bx: number, by: number, bz: number): Quat {
    if (by > 0.99999) return [0, 0, 0, 1];               // already +Y
    if (by < -0.99999) return [0, 0, 1, 0];              // 180° (about Z) onto −Y
    // half-vector method: h = normalize((0,1,0) + b); q = ((0,1,0)×h, (0,1,0)·h)
    const hx = bx, hy = 1 + by, hz = bz;
    const hl = Math.hypot(hx, hy, hz) || 1;
    const nx = hx / hl, ny = hy / hl, nz = hz / hl;
    // (0,1,0) × (nx,ny,nz) = (nz·? ) → cross = (1*nz - 0*ny, 0*nx - 0*nz, 0*ny - 1*nx) = (nz, 0, -nx)
    return [nz, 0, -nx, ny];
}

export function fitBoneCapsules(input: FitBoneCapsulesInput): BoneCapsule[] {
    const { jointCount, inverseBindMatrices: ibm, skin } = input;
    const minWeight = input.minWeight ?? 0.5;
    const minVertices = input.minVertices ?? 6;
    const vertexCount = skin.positions.length / 3;

    // bone-local AABB per joint (min/max), accumulated over its dominant vertices
    const min = new Float32Array(jointCount * 3).fill(Infinity);
    const max = new Float32Array(jointCount * 3).fill(-Infinity);
    const count = new Uint32Array(jointCount);
    const p: [number, number, number] = [0, 0, 0];

    for (let v = 0; v < vertexCount; v++) {
        // dominant bone = the vertex's max-weight joint
        let best = 0, bestW = -1;
        for (let k = 0; k < 4; k++) { const w = skin.weights[v * 4 + k]; if (w > bestW) { bestW = w; best = skin.joints[v * 4 + k]; } }
        if (bestW < minWeight || best >= jointCount) continue;
        transformPoint(ibm, best * 16, skin.positions[v * 3], skin.positions[v * 3 + 1], skin.positions[v * 3 + 2], p);
        const b = best * 3;
        if (p[0] < min[b]) min[b] = p[0]; if (p[0] > max[b]) max[b] = p[0];
        if (p[1] < min[b + 1]) min[b + 1] = p[1]; if (p[1] > max[b + 1]) max[b + 1] = p[1];
        if (p[2] < min[b + 2]) min[b + 2] = p[2]; if (p[2] > max[b + 2]) max[b + 2] = p[2];
        count[best]++;
    }

    const out: BoneCapsule[] = [];
    for (let j = 0; j < jointCount; j++) {
        if (count[j] < minVertices) continue;
        const b = j * 3;
        const ex = max[b] - min[b], ey = max[b + 1] - min[b + 1], ez = max[b + 2] - min[b + 2];
        // longest extent = capsule axis; the other two give the (bounding) radius
        let axis: 0 | 1 | 2 = 0, axisExtent = ex, r1 = ey, r2 = ez;
        if (ey >= ex && ey >= ez) { axis = 1; axisExtent = ey; r1 = ex; r2 = ez; }
        else if (ez >= ex && ez >= ey) { axis = 2; axisExtent = ez; r1 = ex; r2 = ey; }
        const radius = Math.max(r1, r2) / 2 || 1e-3;
        const halfHeight = Math.max(0, axisExtent / 2 - radius);
        const offsetPosition: Vec3 = [(min[b] + max[b]) / 2, (min[b + 1] + max[b + 1]) / 2, (min[b + 2] + max[b + 2]) / 2];
        const offsetRotation = quatFromY(axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0);
        out.push({ jointIndex: j, offsetPosition, offsetRotation, radius, halfHeight });
    }
    return out;
}
