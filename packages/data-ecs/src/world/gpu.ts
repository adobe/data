/**
 * A world's GPU. Render pipelines that use `Gpu.wgsl` declarations take `layout` at the group they name. Its bind
 * groups and buffers stay the world's, so they can be replaced as storage grows.
 */
export type Gpu = { readonly device: GPUDevice; readonly layout: GPUBindGroupLayout };

/** The app's device, which the world uses but never destroys. */
export type GpuOptions = { readonly device: GPUDevice };
