// © 2026 Adobe. MIT License. See /LICENSE for details.

export function cubemapSampleView(texture: GPUTexture): GPUTextureView {
    return texture.createView({
        dimension: "cube",
        baseArrayLayer: 0,
        arrayLayerCount: 6,
    });
}
