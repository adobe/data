import { Resource } from '../resource/resource.js';

/**
 * The kernel pool's size: the workers kernels run on in chunks, 0 for none. It starts at the platform's default, one
 * worker per hardware thread but the world's, or 0 where workers can't share memory. The pool follows it at sync points.
 */
export const workers = 'workers';

declare module '@adobe/data-ecs' {
    export interface Resources {
        [workers]: { type: number };
    }
}

/** Workers share the world's memory, which needs cross-origin isolation in a page and a `Worker` constructor. */
const platformWorkers = globalThis.crossOriginIsolated !== false && typeof Worker === "function"
    ? Math.max(1, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1)
    : 0;

Resource.register(workers, { type: { type: "integer", minimum: 0, default: platformWorkers } });
