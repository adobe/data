// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Aabb } from "@adobe/data/math";
import type { ShapeMesh } from "./shape-mesh.js";

const FLOATS_PER_VERTEX = 12;

/** Axis-aligned bounds of packed StandardVertex positions in a shape mesh. */
export const boundsFromShapeMesh = (mesh: ShapeMesh): Aabb => {
    const v = mesh.vertices;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < v.length; i += FLOATS_PER_VERTEX) {
        const x = v[i], y = v[i + 1], z = v[i + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
};
