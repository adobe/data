// © 2026 Adobe. MIT License. See /LICENSE for details.

export function createCubemap(
    device: GPUDevice,
    size: number,
    format: GPUTextureFormat,
    mipLevelCount = 1,
): GPUTexture {
    return device.createTexture({
        size: [size, size, 6],
        format,
        mipLevelCount,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST,
        dimension: "2d",
        textureBindingViewDimension: "cube",
    });
}
