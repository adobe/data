// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Mat4x4, type Aabb } from "@adobe/data/math";
import { VisibleMaterial } from "../../../rendering/visible-material/visible-material.js";
import { readAccessor } from "./accessor-view.js";
import { buildMaterialBindGroup, type FallbackViews } from "./build-material-bind-group.js";
import { computeWorldMatrices } from "./compute-world-matrices.js";
import { createFallbackTextures, decodeAllImages } from "./decode-images.js";
import { packPrimitiveVertices } from "./pack-vertex-buffer.js";
import { parseGlb } from "./parse-glb.js";
import { parseGltfSkin, type LoadedSkin } from "./parse-skin.js";
import { parseGltfAnimations, type LoadedAnimation } from "./parse-animations.js";

export interface GpuPrimitiveData {
    pbrVertexBuffer: GPUBuffer;
    /** Secondary VBO with skinning attributes (joints u32×4, weights f32×4).
     *  Null for non-skinned primitives. Drives the renderer's pipeline choice. */
    pbrSkinVertexBuffer: GPUBuffer | null;
    pbrIndexBuffer: GPUBuffer;
    pbrIndexCount: number;
    pbrIndexFormat: GPUIndexFormat;
    pbrMaterialBindGroup: GPUBindGroup;
    /** Node's model-root-local matrix. Renderers pre-multiply this with the
     *  per-instance model-root world matrix at draw time. Identity for
     *  single-node and skinned-mesh primitives (skin owns the deformation). */
    pbrNodeLocalMatrix: Mat4x4;
}

export interface LoadedGltfData {
    primitives: GpuPrimitiveData[];
    bounds: Aabb;
    /** Present when the glTF declares a `skins[0]`. */
    skin: LoadedSkin | null;
    /** Parsed `animations[]`; jointIndex on each track is into `skin.jointTemplate`. */
    animations: LoadedAnimation[];
    /** Model-space collision geometry retained on the CPU for auto-generating
     *  physics colliders (convex hull / trimesh) — the non-skinned primitives'
     *  positions (each baked by its node matrix) + indices, aggregated. Null when
     *  the model has no static geometry (e.g. skin-only). */
    collision: { positions: Float32Array; indices: Uint32Array } | null;
    /** Skinned vertices retained on the CPU (mesh-bind positions + 4 joint
     *  indices + 4 weights per vertex), for fitting per-bone ragdoll capsules.
     *  Null for non-skinned models. */
    skinVertices: { positions: Float32Array; joints: Uint32Array; weights: Float32Array } | null;
}

function expandBounds(
    m: Mat4x4,
    localMin: readonly [number, number, number],
    localMax: readonly [number, number, number],
    outMin: [number, number, number],
    outMax: [number, number, number],
): void {
    const xs = [localMin[0], localMax[0]];
    const ys = [localMin[1], localMax[1]];
    const zs = [localMin[2], localMax[2]];
    for (const lx of xs) for (const ly of ys) for (const lz of zs) {
        const wx = m[0] * lx + m[4] * ly + m[8]  * lz + m[12];
        const wy = m[1] * lx + m[5] * ly + m[9]  * lz + m[13];
        const wz = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
        if (wx < outMin[0]) outMin[0] = wx; if (wx > outMax[0]) outMax[0] = wx;
        if (wy < outMin[1]) outMin[1] = wy; if (wy > outMax[1]) outMax[1] = wy;
        if (wz < outMin[2]) outMin[2] = wz; if (wz > outMax[2]) outMax[2] = wz;
    }
}

function pickIndexFormat(raw: Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer> | Uint8Array<ArrayBuffer> | Float32Array<ArrayBuffer>): {
    indices: Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer>;
    format: GPUIndexFormat;
} {
    if (raw instanceof Uint32Array) return { indices: raw, format: "uint32" };
    if (raw instanceof Uint16Array) return { indices: raw, format: "uint16" };
    if (raw instanceof Uint8Array) {
        const u16 = new Uint16Array(raw.length);
        for (let i = 0; i < raw.length; i++) u16[i] = raw[i];
        return { indices: u16, format: "uint16" };
    }
    throw new Error("Index accessor must be an integer type");
}

export async function loadGltfPrimitives(device: GPUDevice, url: string): Promise<LoadedGltfData> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
    const buffer = await response.arrayBuffer();

    const { json, bin } = parseGlb(buffer);

    const materialLayout = VisibleMaterial.createBindGroupLayout(device);
    const sourceTextures = await decodeAllImages(device, json, bin);
    const fallback: FallbackViews = createFallbackTextures(device);

    const sampler = device.createSampler({
        magFilter: "linear",
        minFilter: "linear",
        addressModeU: "repeat",
        addressModeV: "repeat",
    });

    const worldMatrices = computeWorldMatrices(json);
    const skin = parseGltfSkin(json, bin);
    const animations = skin ? parseGltfAnimations(json, bin, json.skins![0].joints) : [];

    const boundsMin: [number, number, number] = [Infinity, Infinity, Infinity];
    const boundsMax: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    const primitives: GpuPrimitiveData[] = [];
    // CPU-retained collision geometry (model space, non-skinned primitives only).
    const collPositions: number[] = [], collIndices: number[] = [];
    // CPU-retained skin vertices (mesh-bind space, skinned primitives only).
    const skinPos: number[] = [], skinJoints: number[] = [], skinWeights: number[] = [];

    for (let nodeIdx = 0; nodeIdx < (json.nodes ?? []).length; nodeIdx++) {
        const node = json.nodes![nodeIdx];
        if (node.mesh === undefined) continue;
        const mesh = json.meshes![node.mesh];
        // For skinned primitives the joint transforms own the deformation;
        // the mesh node's own transform must not be baked in. For non-skinned
        // primitives we pre-bake the node's world matrix as before.
        const skinned = node.skin !== undefined;
        const pbrNodeLocalMatrix = skinned ? Mat4x4.identity : worldMatrices[nodeIdx];

        for (const prim of mesh.primitives) {
            const packed = packPrimitiveVertices(json, bin, prim);

            expandBounds(pbrNodeLocalMatrix, packed.boundsMin, packed.boundsMax, boundsMin, boundsMax);

            const vertexBuffer = device.createBuffer({
                size: packed.vertices.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
            device.queue.writeBuffer(vertexBuffer, 0, packed.vertices);

            let skinVertexBuffer: GPUBuffer | null = null;
            if (packed.skinningAttributes) {
                skinVertexBuffer = device.createBuffer({
                    size: packed.skinningAttributes.byteLength,
                    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
                });
                device.queue.writeBuffer(skinVertexBuffer, 0, packed.skinningAttributes);
            }

            // Non-indexed primitives are valid in glTF — synthesize sequential indices.
            let indices: Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer>;
            let format: GPUIndexFormat;
            if (prim.indices === undefined) {
                if (packed.vertexCount <= 0xffff) {
                    indices = new Uint16Array(packed.vertexCount);
                    for (let k = 0; k < packed.vertexCount; k++) indices[k] = k;
                    format = "uint16";
                } else {
                    indices = new Uint32Array(packed.vertexCount);
                    for (let k = 0; k < packed.vertexCount; k++) indices[k] = k;
                    format = "uint32";
                }
            } else {
                const raw = readAccessor(json, bin, prim.indices);
                ({ indices, format } = pickIndexFormat(raw));
            }

            const indexBuffer = device.createBuffer({
                size: indices.byteLength,
                usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            });
            device.queue.writeBuffer(indexBuffer, 0, indices);

            // Retain collision geometry for non-skinned primitives: deinterleave the
            // positions (stride = floats/vertex, position at offset 0), bake the node
            // matrix into model space, and append with index offset. Skinned primitives
            // deform at runtime, so a static collider from their bind pose is meaningless.
            if (!skinned) {
                const m = pbrNodeLocalMatrix, verts = packed.vertices;
                const stride = packed.vertices.length / packed.vertexCount;
                const vbase = collPositions.length / 3;
                for (let v = 0; v < packed.vertexCount; v++) {
                    const o = v * stride, x = verts[o], y = verts[o + 1], z = verts[o + 2];
                    collPositions.push(
                        m[0] * x + m[4] * y + m[8] * z + m[12],
                        m[1] * x + m[5] * y + m[9] * z + m[13],
                        m[2] * x + m[6] * y + m[10] * z + m[14],
                    );
                }
                for (let k = 0; k < indices.length; k++) collIndices.push(indices[k] + vbase);
            } else if (packed.skinningAttributes) {
                // Retain skin vertices (mesh-bind positions + joints/weights) for
                // fitting per-bone ragdoll capsules. Skinning attributes pack 8 words
                // per vertex: joints (u32×4) in words 0–3, weights (f32×4) in 4–7.
                const verts = packed.vertices, stride = packed.vertices.length / packed.vertexCount;
                const sj = new Uint32Array(packed.skinningAttributes), sw = new Float32Array(packed.skinningAttributes);
                for (let v = 0; v < packed.vertexCount; v++) {
                    const o = v * stride, s = v * 8;
                    skinPos.push(verts[o], verts[o + 1], verts[o + 2]);
                    skinJoints.push(sj[s], sj[s + 1], sj[s + 2], sj[s + 3]);
                    skinWeights.push(sw[s + 4], sw[s + 5], sw[s + 6], sw[s + 7]);
                }
            }

            const materialBindGroup = buildMaterialBindGroup(
                device, json, sourceTextures, fallback, sampler, materialLayout, prim.material,
            );

            primitives.push({
                pbrVertexBuffer: vertexBuffer,
                pbrSkinVertexBuffer: skinVertexBuffer,
                pbrIndexBuffer: indexBuffer,
                pbrIndexCount: indices.length,
                pbrIndexFormat: format,
                pbrMaterialBindGroup: materialBindGroup,
                pbrNodeLocalMatrix,
            });
        }
    }

    return {
        primitives,
        bounds: { min: boundsMin as [number, number, number], max: boundsMax as [number, number, number] },
        skin,
        animations,
        collision: collPositions.length ? { positions: new Float32Array(collPositions), indices: new Uint32Array(collIndices) } : null,
        skinVertices: skinPos.length ? { positions: new Float32Array(skinPos), joints: new Uint32Array(skinJoints), weights: new Float32Array(skinWeights) } : null,
    };
}
