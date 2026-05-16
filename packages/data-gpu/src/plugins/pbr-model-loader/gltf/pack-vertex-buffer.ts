// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3 } from "@adobe/data/math";
import { stride as vertexStride } from "../../../types/standard-vertex/layout.js";
import { SKINNING_STRIDE } from "../../../types/skinning-attributes/layout.js";
import { readAccessor } from "./accessor-view.js";
import type { GltfAsset, GltfPrimitive } from "./gltf-types.js";

const FLOATS_PER_VERTEX = vertexStride / 4; // 48 / 4 = 12

type MutVec3 = [number, number, number];

export interface PackedPrimitive {
    vertices: Float32Array;
    /** Packed skinning attributes (uint32×4 joints, float32×4 weights). Null
     *  for non-skinned primitives. Size = vertexCount × {@link SKINNING_STRIDE}. */
    skinningAttributes: ArrayBuffer | null;
    vertexCount: number;
    boundsMin: Vec3;
    boundsMax: Vec3;
}

/**
 * Reads POSITION/NORMAL/TANGENT/TEXCOORD_0 from a primitive and interleaves
 * them into the packed StandardVertex layout (48 bytes / vertex).
 *
 * If JOINTS_0 and WEIGHTS_0 are present, also packs them into a separate
 * skinning attribute buffer with stride {@link SKINNING_STRIDE}.
 *
 * Vertices are kept in node-local space — no world transform is applied here.
 */
export function packPrimitiveVertices(
    gltf: GltfAsset,
    bin: ArrayBuffer,
    prim: GltfPrimitive,
): PackedPrimitive {
    const positions = readAccessor(gltf, bin, prim.attributes.POSITION) as Float32Array;
    // Normals and UVs are optional in glTF — fall back to defaults when absent.
    // Skinned demo meshes (e.g. Fox) frequently omit NORMAL.
    const normals = prim.attributes.NORMAL !== undefined
        ? readAccessor(gltf, bin, prim.attributes.NORMAL) as Float32Array
        : null;
    const uvs = prim.attributes.TEXCOORD_0 !== undefined
        ? readAccessor(gltf, bin, prim.attributes.TEXCOORD_0) as Float32Array
        : null;
    const tangents = prim.attributes.TANGENT !== undefined
        ? readAccessor(gltf, bin, prim.attributes.TANGENT) as Float32Array
        : null;
    // glTF JOINTS_0 is unsigned byte vec4 or unsigned short vec4; readAccessor
    // returns either Uint8Array or Uint16Array. WEIGHTS_0 is usually float32x4.
    const joints = prim.attributes.JOINTS_0 !== undefined
        ? readAccessor(gltf, bin, prim.attributes.JOINTS_0) as Uint8Array | Uint16Array | Uint32Array
        : null;
    const weights = prim.attributes.WEIGHTS_0 !== undefined
        ? readAccessor(gltf, bin, prim.attributes.WEIGHTS_0) as Float32Array
        : null;
    const skinned = joints !== null && weights !== null;

    const vertexCount = positions.length / 3;
    const out = new Float32Array(vertexCount * FLOATS_PER_VERTEX);
    const skin = skinned ? new ArrayBuffer(vertexCount * SKINNING_STRIDE) : null;
    const skinJointsView = skin ? new Uint32Array(skin) : null;
    const skinWeightsView = skin ? new Float32Array(skin) : null;

    const min: MutVec3 = [Infinity, Infinity, Infinity];
    const max: MutVec3 = [-Infinity, -Infinity, -Infinity];

    for (let i = 0; i < vertexCount; i++) {
        const px = positions[i * 3], py = positions[i * 3 + 1], pz = positions[i * 3 + 2];
        const nx = normals ? normals[i * 3]     : 0;
        const ny = normals ? normals[i * 3 + 1] : 1;
        const nz = normals ? normals[i * 3 + 2] : 0;

        let tx = 1, ty = 0, tz = 0, tw = 1;
        if (tangents) {
            tx = tangents[i * 4]; ty = tangents[i * 4 + 1];
            tz = tangents[i * 4 + 2]; tw = tangents[i * 4 + 3];
        }

        const u = uvs ? uvs[i * 2] : 0;
        const v = uvs ? uvs[i * 2 + 1] : 0;

        const o = i * FLOATS_PER_VERTEX;
        out[o + 0] = px;  out[o + 1] = py;  out[o + 2] = pz;
        out[o + 3] = nx;  out[o + 4] = ny;  out[o + 5] = nz;
        out[o + 6] = tx;  out[o + 7] = ty;  out[o + 8] = tz;  out[o + 9] = tw;
        out[o + 10] = u; out[o + 11] = v;

        if (skinned) {
            // 32-byte stride / 4-byte words = 8 words per skinned vertex:
            //   words 0..3: joints (u32 each)
            //   words 4..7: weights (f32 each)
            const so = i * 8;
            skinJointsView![so + 0] = joints![i * 4 + 0];
            skinJointsView![so + 1] = joints![i * 4 + 1];
            skinJointsView![so + 2] = joints![i * 4 + 2];
            skinJointsView![so + 3] = joints![i * 4 + 3];
            skinWeightsView![so + 4] = weights![i * 4 + 0];
            skinWeightsView![so + 5] = weights![i * 4 + 1];
            skinWeightsView![so + 6] = weights![i * 4 + 2];
            skinWeightsView![so + 7] = weights![i * 4 + 3];
        }

        if (px < min[0]) min[0] = px; if (px > max[0]) max[0] = px;
        if (py < min[1]) min[1] = py; if (py > max[1]) max[1] = py;
        if (pz < min[2]) min[2] = pz; if (pz > max[2]) max[2] = pz;
    }

    return {
        vertices: out,
        skinningAttributes: skin,
        vertexCount,
        boundsMin: min as Vec3,
        boundsMax: max as Vec3,
    };
}
