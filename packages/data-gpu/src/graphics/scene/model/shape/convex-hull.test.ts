// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { hullFaces, convexHullMesh } from "./convex-hull.js";

const f32 = (pts: number[][]) => new Float32Array(pts.flat());

describe("convexHull", () => {
    const px = (p: Float32Array, i: number) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]] as const;

    // every input point lies on the inner side of every face plane (within tol),
    // and every face normal points away from the cloud centroid (outward).
    const assertValidHull = (points: Float32Array) => {
        const faces = hullFaces(points);
        expect(faces).not.toBeNull();
        const n = points.length / 3;
        let gx = 0, gy = 0, gz = 0;
        for (let i = 0; i < n; i++) { const [x, y, z] = px(points, i); gx += x; gy += y; gz += z; }
        gx /= n; gy /= n; gz /= n;
        for (const fc of faces!) {
            const [ax, ay, az] = px(points, fc.a);
            for (let p = 0; p < n; p++) { // no point strictly outside this face
                const [x, y, z] = px(points, p);
                expect(fc.nx * (x - ax) + fc.ny * (y - ay) + fc.nz * (z - az)).toBeLessThan(1e-4);
            }
            // outward: normal agrees with (face vertex − cloud centroid)
            expect(fc.nx * (ax - gx) + fc.ny * (ay - gy) + fc.nz * (az - gz)).toBeGreaterThan(0);
        }
        return faces!;
    };

    it("tetrahedron → 4 faces", () => {
        expect(assertValidHull(f32([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]])).length).toBe(4);
    });

    it("octahedron → 8 faces", () => {
        expect(assertValidHull(f32([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]])).length).toBe(8);
    });

    it("cube → a valid closed hull using all 8 corners", () => {
        const cube = f32([[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]);
        const faces = assertValidHull(cube);
        const used = new Set<number>();
        for (const f of faces) { used.add(f.a); used.add(f.b); used.add(f.c); }
        expect(used.size).toBe(8); // every corner is a hull vertex
        // V − E + F = 2 (Euler), with all triangular faces ⇒ E = 3F/2 ⇒ F = 12
        expect(faces.length).toBe(12);
    });

    it("interior points are discarded", () => {
        const withInterior = f32([
            [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
            [0, 0, 0], [0.5, 0.2, -0.3], // inside — must not appear on the hull
        ]);
        const faces = assertValidHull(withInterior);
        const used = new Set<number>();
        for (const f of faces) { used.add(f.a); used.add(f.b); used.add(f.c); }
        expect(used.has(8)).toBe(false);
        expect(used.has(9)).toBe(false);
    });

    it("degenerate clouds → null (< 4 points, or coplanar)", () => {
        expect(hullFaces(f32([[0, 0, 0], [1, 0, 0], [0, 1, 0]]))).toBeNull();          // 3 points
        expect(hullFaces(f32([[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]]))).toBeNull(); // coplanar (z=0)
    });

    it("convexHullMesh emits flat-shaded StandardVertex triangles (12 floats/vert, 3 verts/tri)", () => {
        const mesh = convexHullMesh(f32([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]]));
        expect(mesh.indices.length).toBe(12);          // 4 faces × 3
        expect(mesh.vertices.length).toBe(12 * 12);     // 12 verts × 12 floats
    });
});
