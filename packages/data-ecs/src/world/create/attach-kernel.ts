import type { Name } from '../../system/name.js';
import type { System } from '../../system/system.js';
import type { KernelDescription } from './kernel.js';

/** By the system `System.create` returned, so a lookup doesn't depend on which copy of the package defined it. */
const kernels = new WeakMap<System<unknown>, KernelDescription>();

/** The compiler's only hook into the runtime: wraps each kernel system's `System.create` call. */
export const attachKernel = <S extends System<unknown>>(system: S, description: KernelDescription): S => {
    kernels.set(system, description);
    return system;
};

export const kernelOf = (system: System<unknown>): KernelDescription | undefined => kernels.get(system);
