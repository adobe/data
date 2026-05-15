// © 2026 Adobe. MIT License. See /LICENSE for details.

import { createStructBuffer, copyToGPUBuffer, getStructLayout, type TypedBuffer } from "@adobe/data/typed-buffer";
import { schema as pbrMaterialSchema } from "../../../types/pbr-material/schema.js";
import type { PbrMaterial } from "../../../types/pbr-material/pbr-material.js";
import type { GltfAsset, GltfMaterial } from "./gltf-types.js";

const layout = getStructLayout(pbrMaterialSchema);

export interface MaterialTextures {
    baseColor: GPUTextureView;
    metallicRoughness: GPUTextureView;
    normal: GPUTextureView;
    occlusion: GPUTextureView;
    emissive: GPUTextureView;
}

export interface FallbackViews {
    white: GPUTextureView;
    black: GPUTextureView;
    flatNormal: GPUTextureView;
}

function defaultMaterial(): PbrMaterial {
    return {
        baseColorFactor: [1, 1, 1, 1],
        emissiveFactor: [0, 0, 0],
        metallicFactor: 1,
        roughnessFactor: 1,
        normalScale: 1,
        occlusionStrength: 1,
    };
}

function gltfToPbrMaterial(m: GltfMaterial): PbrMaterial {
    const pbr = m.pbrMetallicRoughness;
    return {
        baseColorFactor: pbr?.baseColorFactor ?? [1, 1, 1, 1],
        emissiveFactor: m.emissiveFactor ?? [0, 0, 0],
        metallicFactor: pbr?.metallicFactor ?? 1,
        roughnessFactor: pbr?.roughnessFactor ?? 1,
        normalScale: m.normalTexture?.scale ?? 1,
        occlusionStrength: m.occlusionTexture?.strength ?? 1,
    };
}

function viewFor(
    textures: GPUTexture[],
    gltf: GltfAsset,
    textureIndex: number | undefined,
    fallback: GPUTextureView,
): GPUTextureView {
    if (textureIndex === undefined) return fallback;
    const tex = gltf.textures?.[textureIndex];
    if (!tex || tex.source === undefined) return fallback;
    const gpuTexture = textures[tex.source];
    if (!gpuTexture) return fallback;
    return gpuTexture.createView();
}

/**
 * Builds the per-primitive material bind group: a small uniform buffer holding
 * the PBR factors plus the five sampled textures and a shared sampler.
 *
 * Missing textures fall back to neutral 1x1 textures so the shader always has
 * a valid binding (white for baseColor/occlusion, black for emissive, flat
 * (0.5, 0.5, 1) for the normal map).
 */
export function buildMaterialBindGroup(
    device: GPUDevice,
    gltf: GltfAsset,
    sourceTextures: GPUTexture[],
    fallback: FallbackViews,
    sampler: GPUSampler,
    layoutGpu: GPUBindGroupLayout,
    materialIndex: number | undefined,
): GPUBindGroup {
    const material = materialIndex !== undefined && gltf.materials?.[materialIndex]
        ? gltfToPbrMaterial(gltf.materials[materialIndex])
        : defaultMaterial();
    const gltfMat = materialIndex !== undefined ? gltf.materials?.[materialIndex] : undefined;

    const structBuffer: TypedBuffer<PbrMaterial> = createStructBuffer(pbrMaterialSchema, layout.size);
    structBuffer.set(0, material);

    let uniformBuffer = device.createBuffer({
        size: layout.size,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    uniformBuffer = copyToGPUBuffer(structBuffer, device, uniformBuffer);

    const baseColorView = viewFor(sourceTextures, gltf, gltfMat?.pbrMetallicRoughness?.baseColorTexture?.index, fallback.white);
    const mrView = viewFor(sourceTextures, gltf, gltfMat?.pbrMetallicRoughness?.metallicRoughnessTexture?.index, fallback.white);
    const normalView = viewFor(sourceTextures, gltf, gltfMat?.normalTexture?.index, fallback.flatNormal);
    const occlusionView = viewFor(sourceTextures, gltf, gltfMat?.occlusionTexture?.index, fallback.white);
    const emissiveView = viewFor(sourceTextures, gltf, gltfMat?.emissiveTexture?.index, fallback.black);

    return device.createBindGroup({
        layout: layoutGpu,
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 1, resource: baseColorView },
            { binding: 2, resource: mrView },
            { binding: 3, resource: normalView },
            { binding: 4, resource: occlusionView },
            { binding: 5, resource: emissiveView },
            { binding: 6, resource: sampler },
        ],
    });
}
