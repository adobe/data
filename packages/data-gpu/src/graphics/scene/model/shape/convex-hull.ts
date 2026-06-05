// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { ShapeMesh } from "./shape-mesh.js";

/**
 * Faceted render mesh of the convex hull of a point cloud (flat per-face normals,
 * StandardVertex layout). A convex collider is *authored* as a point cloud — the
 * physics engine builds the collision hull from the same points — but rendering
 * needs a triangulated surface, which this computes. Phase-2 auto-hull (hull of a
 * render mesh's vertices) reuses it.
 *
 * Incremental 3D hull: seed a tetrahedron, then fold each remaining point in by
 * deleting the faces it can see and bridging the horizon to it. Every face's
 * normal is oriented away from a fixed interior point (the seed centroid, always
 * strictly inside a convex hull) — so orientation is robust without half-edge
 * bookkeeping. Authored hulls are small (tens of points), so the simple O(n·f)
 * form is plenty fast. Degenerate input (< 4 points or coplanar) → empty mesh.
 */

interface Face { a: number; b: number; c: number; nx: number; ny: number; nz: number }

const EPS = 1e-7;

export function convexHullMesh(points: Float32Array): ShapeMesh {
    const faces = hullFaces(points);
    if (!faces) return { vertices: new Float32Array(0), indices: new Uint16Array(0) };
    const px = (i: number) => points[i * 3], py = (i: number) => points[i * 3 + 1], pz = (i: number) => points[i * 3 + 2];

    // flat-shaded: three unique verts per face, all sharing the face normal.
    const verts: number[] = [], indices: number[] = [];
    for (const f of faces) {
        const len = Math.hypot(f.nx, f.ny, f.nz) || 1;
        const nx = f.nx / len, ny = f.ny / len, nz = f.nz / len;
        // any in-plane unit vector for the tangent (flat shading ignores its sign)
        let tx = px(f.b) - px(f.a), ty = py(f.b) - py(f.a), tz = pz(f.b) - pz(f.a);
        const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
        const base = verts.length / 12;
        const corners = [f.a, f.b, f.c], uv = [[0, 0], [1, 0], [0, 1]];
        for (let i = 0; i < 3; i++) {
            const v = corners[i];
            verts.push(px(v), py(v), pz(v), nx, ny, nz, tx, ty, tz, 1, uv[i][0], uv[i][1]);
        }
        indices.push(base, base + 1, base + 2);
    }
    return { vertices: new Float32Array(verts), indices: new Uint16Array(indices) };
}

/** The hull's triangular faces, each normal oriented outward, or null if the
 *  point cloud is degenerate (fewer than 4 points, or all coplanar). Exported
 *  for tests; rendering goes through {@link convexHullMesh}. */
export function hullFaces(points: Float32Array): Face[] | null {
    const n = points.length / 3;
    if (n < 4) return null;
    const px = (i: number) => points[i * 3], py = (i: number) => points[i * 3 + 1], pz = (i: number) => points[i * 3 + 2];

    const seed = seedTetra(n, px, py, pz);
    if (!seed) return null;
    // centroid of the seed tetra — strictly inside the hull for its whole life, so
    // "normal points away from this" is always the correct outward test.
    const [i0, i1, i2, i3] = seed;
    const cx = (px(i0) + px(i1) + px(i2) + px(i3)) / 4;
    const cy = (py(i0) + py(i1) + py(i2) + py(i3)) / 4;
    const cz = (pz(i0) + pz(i1) + pz(i2) + pz(i3)) / 4;

    const makeFace = (a: number, b: number, c: number): Face => {
        const ux = px(b) - px(a), uy = py(b) - py(a), uz = pz(b) - pz(a);
        const vx = px(c) - px(a), vy = py(c) - py(a), vz = pz(c) - pz(a);
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        if (nx * (px(a) - cx) + ny * (py(a) - cy) + nz * (pz(a) - cz) < 0) { // points inward → flip
            return { a, b: c, c: b, nx: -nx, ny: -ny, nz: -nz };
        }
        return { a, b, c, nx, ny, nz };
    };
    const above = (f: Face, p: number): number =>
        f.nx * (px(p) - px(f.a)) + f.ny * (py(p) - py(f.a)) + f.nz * (pz(p) - pz(f.a));

    const faces: Face[] = [makeFace(i0, i1, i2), makeFace(i0, i1, i3), makeFace(i0, i2, i3), makeFace(i1, i2, i3)];
    for (let p = 0; p < n; p++) {
        if (faces.every(f => above(f, p) <= EPS)) continue; // inside the current hull

        // horizon = edges on exactly one visible face (the toggle leaves only those).
        const horizon = new Map<string, [number, number]>();
        for (const f of faces) {
            if (above(f, p) <= EPS) continue;
            for (const [u, v] of [[f.a, f.b], [f.b, f.c], [f.c, f.a]] as const) {
                const k = u < v ? `${u}_${v}` : `${v}_${u}`;
                if (horizon.has(k)) horizon.delete(k); else horizon.set(k, [u, v]);
            }
        }
        for (let i = faces.length - 1; i >= 0; i--) if (above(faces[i], p) > EPS) faces.splice(i, 1);
        for (const [u, v] of horizon.values()) faces.push(makeFace(u, v, p));
    }
    return faces;
}

/** Indices of 4 non-coplanar seed points (max-spread pair, point farthest from
 *  that line, point farthest from that plane), or null if all points are coplanar. */
function seedTetra(n: number, px: (i: number) => number, py: (i: number) => number, pz: (i: number) => number): [number, number, number, number] | null {
    let i0 = 0, i1 = 0, best = -1;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const d = (px(i) - px(j)) ** 2 + (py(i) - py(j)) ** 2 + (pz(i) - pz(j)) ** 2;
        if (d > best) { best = d; i0 = i; i1 = j; }
    }
    if (best <= EPS) return null;
    const ex = px(i1) - px(i0), ey = py(i1) - py(i0), ez = pz(i1) - pz(i0);
    let i2 = -1; best = EPS;
    for (let i = 0; i < n; i++) { // area² of triangle (i0,i1,i) ∝ |edge × (i0→i)|²
        const wx = px(i) - px(i0), wy = py(i) - py(i0), wz = pz(i) - pz(i0);
        const cx = ey * wz - ez * wy, cy = ez * wx - ex * wz, cz = ex * wy - ey * wx;
        const a = cx * cx + cy * cy + cz * cz;
        if (a > best) { best = a; i2 = i; }
    }
    if (i2 < 0) return null;
    const ux = px(i1) - px(i0), uy = py(i1) - py(i0), uz = pz(i1) - pz(i0);
    const vx = px(i2) - px(i0), vy = py(i2) - py(i0), vz = pz(i2) - pz(i0);
    const pnx = uy * vz - uz * vy, pny = uz * vx - ux * vz, pnz = ux * vy - uy * vx;
    let i3 = -1; best = EPS;
    for (let i = 0; i < n; i++) {
        const d = Math.abs(pnx * (px(i) - px(i0)) + pny * (py(i) - py(i0)) + pnz * (pz(i) - pz(i0)));
        if (d > best) { best = d; i3 = i; }
    }
    if (i3 < 0) return null; // coplanar
    return [i0, i1, i2, i3];
}
