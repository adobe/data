// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Mat4x4, Vec3 } from "@adobe/data/math";
import { stride as vertexStride } from "../types/standard-vertex/layout.js";
import { readAccessor } from "./accessor-view.js";
import type { GltfAsset, GltfPrimitive } from "./gltf-types.js";

const FLOATS_PER_VERTEX = vertexStride / 4; // 48 / 4 = 12

type MutVec3 = [number, number, number];

function transformPoint(m: Mat4x4, x: number, y: number, z: number): MutVec3 {
    const r0 = m[0] * x + m[4] * y + m[8] * z + m[12];
    const r1 = m[1] * x + m[5] * y + m[9] * z + m[13];
    const r2 = m[2] * x + m[6] * y + m[10] * z + m[14];
    return [r0, r1, r2];
}

function transformDirection(m: Mat4x4, x: number, y: number, z: number): MutVec3 {
    const r0 = m[0] * x + m[4] * y + m[8] * z;
    const r1 = m[1] * x + m[5] * y + m[9] * z;
    const r2 = m[2] * x + m[6] * y + m[10] * z;
    const len = Math.hypot(r0, r1, r2) || 1;
    return [r0 / len, r1 / len, r2 / len];
}

export interface PackedPrimitive {
    vertices: Float32Array;
    vertexCount: number;
    boundsMin: Vec3;
    boundsMax: Vec3;
}

/**
 * Reads POSITION/NORMAL/TANGENT/TEXCOORD_0 from a primitive, applies the
 * supplied world matrix on the CPU, and interleaves into the packed
 * StandardVertex layout (48 bytes / vertex).
 *
 * Falls back to (1,0,0,1) tangent when the source primitive omits it — normal
 * mapping will be incorrect on such meshes, but the renderer will not crash.
 */
export function packPrimitiveVertices(
    gltf: GltfAsset,
    bin: ArrayBuffer,
    prim: GltfPrimitive,
    worldMatrix: Mat4x4,
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
        const wp = transformPoint(worldMatrix, positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        const wn = transformDirection(worldMatrix, normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]);

        let tx = 1, ty = 0, tz = 0, tw = 1;
        if (tangents) {
            const wt = transformDirection(worldMatrix, tangents[i * 4], tangents[i * 4 + 1], tangents[i * 4 + 2]);
            tx = wt[0]; ty = wt[1]; tz = wt[2]; tw = tangents[i * 4 + 3];
        }

        const o = i * FLOATS_PER_VERTEX;
        out[o + 0] = wp[0]; out[o + 1] = wp[1]; out[o + 2] = wp[2];
        out[o + 3] = wn[0]; out[o + 4] = wn[1]; out[o + 5] = wn[2];
        out[o + 6] = tx;    out[o + 7] = ty;    out[o + 8] = tz;    out[o + 9] = tw;
        out[o + 10] = uvs[i * 2]; out[o + 11] = uvs[i * 2 + 1];

        if (wp[0] < min[0]) min[0] = wp[0]; if (wp[0] > max[0]) max[0] = wp[0];
        if (wp[1] < min[1]) min[1] = wp[1]; if (wp[1] > max[1]) max[1] = wp[1];
        if (wp[2] < min[2]) min[2] = wp[2]; if (wp[2] > max[2]) max[2] = wp[2];
    }

    return { vertices: out, vertexCount, boundsMin: min as Vec3, boundsMax: max as Vec3 };
}
