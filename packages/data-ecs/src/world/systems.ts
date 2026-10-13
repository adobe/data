import type { Finalizer } from '../finalizer/finalizer.js';
import type { Rule } from '../rule/rule.js';
import type { System } from '../system/system.js';
import type { World } from './world.js';

export type Systems = {
    /**
     * Registers systems, composites, rules and finalizers, serialized with runs. Resolves once worker kernels are loaded.
     * Registering the same value again does nothing; a different one with a registered name throws.
     */
    register(...systems: readonly (System | Rule | Finalizer)[]): Promise<World>;
    /** A registered system by name, for replication. */
    get(name: System.Name): System | null;
};
