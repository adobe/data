// © 2026 Adobe. MIT License. See /LICENSE for details.
import { declareResource } from '../registry/declare.js';

/**
 * The device the world's GPU storage lives on, for both `kernel: "gpu"` kernels and render systems, or null for a world
 * without one. It lives on `"world"`, with the world. The world moves its GPU storage to whatever this is set to, and
 * never destroys a device.
 */
export const gpuDevice = Symbol("gpuDevice");

declare module '@adobe/ecs' {
    export interface Resources {
        [gpuDevice]: { type: GPUDevice | null };
    }
}

declareResource(gpuDevice, {});
