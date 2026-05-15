// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import type { Vec3 } from "@adobe/data/math";
import { graphics } from "../../plugins/graphics.js";
import { createMaterialBindGroupLayout } from "../bind-group-layouts.js";
import { pbrCore, type PbrPrimitiveInsert } from "../plugins/pbr-core.js";
import { readAccessor } from "./accessor-view.js";
import { buildMaterialBindGroup, type FallbackViews } from "./build-material-bind-group.js";
import { computeWorldMatrices } from "./compute-world-matrices.js";
import { createFallbackTextures, decodeAllImages } from "./decode-images.js";
import { packPrimitiveVertices } from "./pack-vertex-buffer.js";
import { parseGlb } from "./parse-glb.js";

export interface LoadedGltfModel {
    boundsMin: Vec3;
    boundsMax: Vec3;
    primitiveCount: number;
}

const loaderPlugin = Database.Plugin.combine(pbrCore, graphics);
type PbrDatabase = Database.Plugin.ToDatabase<typeof loaderPlugin>;

function waitForDevice(db: PbrDatabase): Promise<GPUDevice> {
    return new Promise<GPUDevice>(resolve => {
        const unobserve = db.observe.resources.device(value => {
            if (value) {
                resolve(value);
                queueMicrotask(() => unobserve?.());
            }
        });
    });
}

function pickIndexFormat(raw: Uint16Array | Uint32Array | Uint8Array | Float32Array): {
    indices: Uint16Array | Uint32Array;
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

/**
 * Fetches and parses a GLB file at `url`, decodes its textures, builds GPU
 * buffers and per-material bind groups, and inserts one PbrPrimitive entity
 * per mesh primitive. Returns the model's world-space AABB so the caller can
 * frame the camera.
 */
export async function loadGltfModel(db: PbrDatabase, url: string): Promise<LoadedGltfModel> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
    const buffer = await response.arrayBuffer();

    const device = await waitForDevice(db);
    const { json, bin } = parseGlb(buffer);

    const materialLayout = createMaterialBindGroupLayout(device);
    const sourceTextures = await decodeAllImages(device, json, bin);
    const fallback: FallbackViews = createFallbackTextures(device);

    const sampler = device.createSampler({
        magFilter: "linear",
        minFilter: "linear",
        addressModeU: "repeat",
        addressModeV: "repeat",
    });

    const worldMatrices = computeWorldMatrices(json);

    const modelMin: [number, number, number] = [Infinity, Infinity, Infinity];
    const modelMax: [number, number, number] = [-Infinity, -Infinity, -Infinity];

    const primitives: PbrPrimitiveInsert[] = [];

    for (let nodeIdx = 0; nodeIdx < (json.nodes ?? []).length; nodeIdx++) {
        const node = json.nodes![nodeIdx];
        if (node.mesh === undefined) continue;
        const mesh = json.meshes![node.mesh];
        const worldMatrix = worldMatrices[nodeIdx];

        for (const prim of mesh.primitives) {
            const packed = packPrimitiveVertices(json, bin, prim, worldMatrix);

            for (let i = 0; i < 3; i++) {
                if (packed.boundsMin[i] < modelMin[i]) modelMin[i] = packed.boundsMin[i];
                if (packed.boundsMax[i] > modelMax[i]) modelMax[i] = packed.boundsMax[i];
            }

            const vertexBuffer = device.createBuffer({
                size: packed.vertices.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
            device.queue.writeBuffer(vertexBuffer, 0, packed.vertices);

            if (prim.indices === undefined) throw new Error("Non-indexed primitives not supported");
            const raw = readAccessor(json, bin, prim.indices);
            const { indices, format } = pickIndexFormat(raw);

            const indexBuffer = device.createBuffer({
                size: indices.byteLength,
                usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            });
            device.queue.writeBuffer(indexBuffer, 0, indices);

            const materialBindGroup = buildMaterialBindGroup(
                device, json, sourceTextures, fallback, sampler, materialLayout, prim.material,
            );

            primitives.push({
                pbrVertexBuffer: vertexBuffer,
                pbrIndexBuffer: indexBuffer,
                pbrIndexCount: indices.length,
                pbrIndexFormat: format,
                pbrMaterialBindGroup: materialBindGroup,
            });
        }
    }

    db.transactions.pbrInsertPrimitives(primitives);

    return {
        boundsMin: modelMin as unknown as Vec3,
        boundsMax: modelMax as unknown as Vec3,
        primitiveCount: primitives.length,
    };
}
