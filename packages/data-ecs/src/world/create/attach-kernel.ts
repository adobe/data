import type { Leaf } from '../../system/leaf.js';
import type { KernelDescription } from './kernel.js';

/** By body, so a system copied with a new declaration keeps its compiled kernel. */
const kernels = new WeakMap<object, KernelDescription>();

/** The compiler's only hook into the runtime: wraps each kernel system's `System.create` call. */
export const attachKernel = <S extends Leaf>(system: S, description: KernelDescription): S => {
    kernels.set(system.body, description);
    return system;
};

export const kernelOf = (system: Leaf): KernelDescription | undefined => kernels.get(system.body);
