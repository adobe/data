import type { System } from '../system/system.js';
import type { World } from './world.js';

export type Systems = {
    /**
     * Registers systems and composites, serialized with runs. Resolves once worker kernels are loaded.
     * Registering the same value again does nothing; a different system with a registered name throws.
     */
    register(...systems: readonly System[]): Promise<World>;
    /** A registered system by name, for replication. */
    get(name: System.Name): System | null;
};
