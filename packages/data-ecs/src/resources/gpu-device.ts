import { Resource } from '../resource/resource.js';

/**
 * The device the world's GPU storage lives on, for both `kernel: "gpu"` kernels and render systems, or null for a world
 * without one. The world builds its GPU storage once this is set, and never destroys the device. Changing it to
 * another device, or back to null, ends the world.
 */
export const gpuDevice = 'gpuDevice';

declare module '@adobe/data-ecs' {
    export interface Resources {
        [gpuDevice]: { type: GPUDevice | null };
    }
}

Resource.register(gpuDevice, {});
