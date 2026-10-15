import { Resource } from '../resource/resource.js';

/**
 * The device the world's GPU storage lives on, for both `kernel: "gpu"` kernels and render systems, or null for a world
 * without one. The world moves its GPU storage to whatever this is set to, and never destroys a device.
 */
export const gpuDevice = 'gpuDevice';

declare module '@adobe/data-ecs' {
    export interface Resources {
        [gpuDevice]: { type: GPUDevice | null };
    }
}

Resource.register(gpuDevice, {});
