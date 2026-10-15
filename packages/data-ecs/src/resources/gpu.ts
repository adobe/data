import { createRegistry, type AnyDeclaration } from '../registry/create-registry.js';
import type { Schema } from '../schema/schema.js';

/**
 * The world's GPU device, or null for a world without one. It's set when the world is created, as
 * `World.create({ resources: { [gpu]: device } })`, and systems only read it. With it, render systems and `kernel: "gpu"`
 * kernels run on the device, which the world uses but never destroys.
 */
export const gpu = 'gpu';

declare module '@adobe/data-ecs' {
    export interface Resources {
        [gpu]: { type: GPUDevice | null };
    }
}

/** Any value: a device isn't data a schema describes, so it's stored as it is. */
const type: Schema & { readonly default: null } = { allOf: [], default: null };
createRegistry<{ readonly [gpu]: AnyDeclaration }>("resource").register(gpu, { type });
