// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { MaterialArrays } from "./material-arrays.js";

interface DeviceCache {
    layout: GPUBindGroupLayout;
    sampler: GPUSampler;
}
const cacheByDevice = new WeakMap<GPUDevice, DeviceCache>();

function deviceCache(device: GPUDevice): DeviceCache {
    let c = cacheByDevice.get(device);
    if (!c) {
        const tex = (binding: number): GPUBindGroupLayoutEntry => ({
            binding, visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: "float", viewDimension: "2d-array" },
        });
        c = {
            layout: device.createBindGroupLayout({
                entries: [
                    { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
                    tex(1), tex(2), tex(3), tex(4), tex(5),
                    { binding: 6, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
                ],
            }),
            sampler: device.createSampler({
                magFilter: "linear", minFilter: "linear", mipmapFilter: "linear",
                addressModeU: "repeat", addressModeV: "repeat",
            }),
        };
        cacheByDevice.set(device, c);
    }
    return c;
}

/**
 * Bind-group layout for the shared material set: palette storage buffer +
 * five `texture_2d_array`s + a filtering sampler. The renderer's primitive
 * pipeline builds its pipeline layout from this; `createMaterialBindGroup`
 * builds the matching bind group. Cached per device.
 */
export function createMaterialBindGroupLayout(device: GPUDevice): GPUBindGroupLayout {
    return deviceCache(device).layout;
}

export function createMaterialBindGroup(device: GPUDevice, arrays: MaterialArrays, palette: GPUBuffer): GPUBindGroup {
    const { layout, sampler } = deviceCache(device);
    const view = (t: GPUTexture): GPUTextureView => t.createView({ dimension: "2d-array" });
    return device.createBindGroup({
        layout,
        entries: [
            { binding: 0, resource: { buffer: palette } },
            { binding: 1, resource: view(arrays.baseColor) },
            { binding: 2, resource: view(arrays.metallicRoughness) },
            { binding: 3, resource: view(arrays.normal) },
            { binding: 4, resource: view(arrays.occlusion) },
            { binding: 5, resource: view(arrays.emissive) },
            { binding: 6, resource: sampler },
        ],
    });
}
