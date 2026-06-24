// © 2026 Adobe. MIT License. See /LICENSE for details.

export function cubeFaceView(texture: GPUTexture, face: number, mip = 0): GPUTextureView {
    return texture.createView({
        dimension: "2d",
        baseArrayLayer: face,
        arrayLayerCount: 1,
        baseMipLevel: mip,
        mipLevelCount: 1,
    });
}
