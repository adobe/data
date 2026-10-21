import { definitionOf, labelOfItem } from '../../interface/registry/index.js';
import type { System } from '../../interface/system/system.js';
import { checkKernel } from './check-kernel.js';
import type { KernelDescription } from './kernel.js';

/** By the system `System.create` returned, so a lookup doesn't depend on which copy of the package defined it. */
const kernels = new WeakMap<System<unknown>, KernelDescription>();

/**
 * The compiler's only hook into the runtime: wraps each kernel system's `System.create` call. Throws for a kernel that
 * doesn't match its declaration and schemas (`checkKernel`), and for a key that's a list, which a command names as one
 * component only where its build couldn't read the name's module.
 */
export const attachKernel = <S extends System<unknown>>(system: S, description: KernelDescription): S => {
    for (const key of description.keys) {
        if (Array.isArray(key)) throw new Error(`System "${labelOfItem(system)}" names a list of components where a command takes one component; its kernel's build couldn't read the list, so name it from a module the build reads, or as an array literal.`);
    }
    const leaf = definitionOf(system);
    if (leaf !== undefined && leaf.kind !== "composite") checkKernel(leaf, description);
    kernels.set(system, description);
    return system;
};

export const kernelOf = (system: System<unknown>): KernelDescription | undefined => kernels.get(system);
