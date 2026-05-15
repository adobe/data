// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3 } from "@adobe/data/math";
import { stride as vertexStride } from "../../../types/standard-vertex/layout.js";
import { readAccessor } from "./accessor-view.js";
import type { GltfAsset, GltfPrimitive } from "./gltf-types.js";

const FLOATS_PER_VERTEX = vertexStride / 4; // 48 / 4 = 12

type MutVec3 = [number, number, number];

export interface PackedPrimitive {
    vertices: Float32Array;
    vertexCount: number;
    boundsMin: Vec3;
    boundsMax: Vec3;
}

/**
 * Reads POSITION/NORMAL/TANGENT/TEXCOORD_0 from a primitive and interleaves
 * them into the packed StandardVertex layout (48 bytes / vertex).
 *
 * Vertices are kept in node-local space — no world transform is applied here.
 * The caller stores the node's model-root-local matrix as `pbrNodeLocalMatrix`
 * on the resulting PbrPrimitive entity; renderers pre-multiply it with the
 * per-instance model-root world matrix at draw time.
 *
 * Falls back to (1,0,0,1) tangent when the source primitive omits it.
 */
export function packPrimitiveVertices(
    gltf: GltfAsset,
    bin: ArrayBuffer,
    prim: GltfPrimitive,
): PackedPrimitive {
    const positions = readAccessor(gltf, bin, prim.attributes.POSITION) as Float32Array;
    if (prim.attributes.NORMAL === undefined) throw new Error("Primitive missing NORMAL");
    if (prim.attributes.TEXCOORD_0 === undefined) throw new Error("Primitive missing TEXCOORD_0");

    const normals = readAccessor(gltf, bin, prim.attributes.NORMAL) as Float32Array;
    const uvs = readAccessor(gltf, bin, prim.attributes.TEXCOORD_0) as Float32Array;
    const tangents = prim.attributes.TANGENT !== undefined
        ? readAccessor(gltf, bin, prim.attributes.TANGENT) as Float32Array
        : null;

    const vertexCount = positions.length / 3;
    const out = new Float32Array(vertexCount * FLOATS_PER_VERTEX);

    const min: MutVec3 = [Infinity, Infinity, Infinity];
    const max: MutVec3 = [-Infinity, -Infinity, -Infinity];

    for (let i = 0; i < vertexCount; i++) {
        const px = positions[i * 3], py = positions[i * 3 + 1], pz = positions[i * 3 + 2];
        const nx = normals[i * 3], ny = normals[i * 3 + 1], nz = normals[i * 3 + 2];

        let tx = 1, ty = 0, tz = 0, tw = 1;
        if (tangents) {
            tx = tangents[i * 4]; ty = tangents[i * 4 + 1];
            tz = tangents[i * 4 + 2]; tw = tangents[i * 4 + 3];
        }

        const o = i * FLOATS_PER_VERTEX;
        out[o + 0] = px;  out[o + 1] = py;  out[o + 2] = pz;
        out[o + 3] = nx;  out[o + 4] = ny;  out[o + 5] = nz;
        out[o + 6] = tx;  out[o + 7] = ty;  out[o + 8] = tz;  out[o + 9] = tw;
        out[o + 10] = uvs[i * 2]; out[o + 11] = uvs[i * 2 + 1];

        if (px < min[0]) min[0] = px; if (px > max[0]) max[0] = px;
        if (py < min[1]) min[1] = py; if (py > max[1]) max[1] = py;
        if (pz < min[2]) min[2] = pz; if (pz > max[2]) max[2] = pz;
    }

    return { vertices: out, vertexCount, boundsMin: min as Vec3, boundsMax: max as Vec3 };
}
