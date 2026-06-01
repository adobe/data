// © 2026 Adobe. MIT License. See /LICENSE for details.

import { createBindGroupLayout } from "./create-bind-group-layout.js";
import type { ColorMaterialOptions } from "./color-material-options.js";
import { createColorMaterial } from "../../scene/model/gltf/create-color-material.js";
import { createFallbackTextures } from "../../scene/model/gltf/decode-images.js";
import type { FallbackViews } from "../../scene/model/gltf/build-material-bind-group.js";

interface DeviceCache {
    layout: GPUBindGroupLayout;
    sampler: GPUSampler;
    fallback: FallbackViews;
}

const cacheByDevice = new WeakMap<GPUDevice, DeviceCache>();

/**
 * Builds a PBR material bind group from a flat color spec. The layout,
 * sampler, and fallback textures are cached per-device, so calling this
 * once per sphere/cube is cheap.
 *
 * The returned bind group is layout-compatible with the standard PBR
 * pipeline (same layout structure as glTF-loaded materials).
 */
export function createColorBindGroup(
    device: GPUDevice,
    options: ColorMaterialOptions,
): GPUBindGroup {
    let cache = cacheByDevice.get(device);
    if (!cache) {
        cache = {
            layout:   createBindGroupLayout(device),
            sampler:  device.createSampler({ magFilter: "linear", minFilter: "linear", mipmapFilter: "linear" }),
            fallback: createFallbackTextures(device),
        };
        cacheByDevice.set(device, cache);
    }
    return createColorMaterial(device, cache.layout, cache.sampler, cache.fallback, options);
}

