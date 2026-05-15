// © 2026 Adobe. MIT License. See /LICENSE for details.

// Fullscreen-triangle vertex shader: three vertices generate a clip-space
// triangle that covers the viewport. The fragment shader then uses
// @builtin(position) (framebuffer pixels) to derive per-fragment UVs.
export const FULLSCREEN_VS = /* wgsl */ `
@vertex
fn vs_fullscreen(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
    let xs = array<f32, 3>(-1.0, 3.0, -1.0);
    let ys = array<f32, 3>(-1.0, -1.0, 3.0);
    return vec4f(xs[i], ys[i], 0.0, 1.0);
}
`;

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

export function cubeFaceView(texture: GPUTexture, face: number, mip = 0): GPUTextureView {
    return texture.createView({
        dimension: "2d",
        baseArrayLayer: face,
        arrayLayerCount: 1,
        baseMipLevel: mip,
        mipLevelCount: 1,
    });
}

export function cubemapSampleView(texture: GPUTexture): GPUTextureView {
    return texture.createView({
        dimension: "cube",
        baseArrayLayer: 0,
        arrayLayerCount: 6,
    });
}
