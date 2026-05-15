// © 2026 Adobe. MIT License. See /LICENSE for details.

import { createStructBuffer, copyToGPUBuffer, getStructLayout } from "@adobe/data/typed-buffer";
import { schema as pbrMaterialSchema } from "../../../types/pbr-material/schema.js";
import type { PbrMaterial } from "../../../types/pbr-material/pbr-material.js";
import type { FallbackViews } from "./build-material-bind-group.js";

const layout = getStructLayout(pbrMaterialSchema);

export interface ColorMaterialOptions {
    color: [number, number, number, number];
    emissive?: [number, number, number];
    metallic?: number;
    roughness?: number;
}

export function createColorMaterial(
    device: GPUDevice,
    bindGroupLayout: GPUBindGroupLayout,
    sampler: GPUSampler,
    fallback: FallbackViews,
    options: ColorMaterialOptions,
): GPUBindGroup {
    const material: PbrMaterial = {
        baseColorFactor: options.color,
        emissiveFactor: options.emissive ?? [0, 0, 0],
        metallicFactor: options.metallic ?? 0,
        roughnessFactor: options.roughness ?? 0.8,
        normalScale: 1,
        occlusionStrength: 1,
    };

    const structBuffer = createStructBuffer(pbrMaterialSchema, layout.size);
    structBuffer.set(0, material);
    let uniformBuffer = device.createBuffer({
        size: layout.size,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    uniformBuffer = copyToGPUBuffer(structBuffer, device, uniformBuffer);

    return device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 1, resource: fallback.white },
            { binding: 2, resource: fallback.white },
            { binding: 3, resource: fallback.flatNormal },
            { binding: 4, resource: fallback.white },
            { binding: 5, resource: fallback.white },
            { binding: 6, resource: sampler },
        ],
    });
}
