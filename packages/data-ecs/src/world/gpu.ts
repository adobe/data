import type { System } from '../system/system.js';

/**
 * A world's GPU. Render pipelines that use `Gpu.wgsl` declarations take `layout` at the group they name. Its bind
 * groups and buffers stay the world's, so they can be replaced as storage grows.
 */
export type Gpu = { readonly device: GPUDevice; readonly layout: GPUBindGroupLayout };

/** `place`: kernels that run on the GPU instead of the CPU; registering one that can't rejects with the reason. */
export type GpuOptions = { readonly device: GPUDevice; readonly place?: readonly System[] };
