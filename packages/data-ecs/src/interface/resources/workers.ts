import { Resource } from '../resource/resource.js';

/** The kernel pool's size, 0 for none, or `null`, the default, for the platform's choice. The pool follows it at sync points. */
export const workers = Symbol("workers");

declare module '@adobe/data-ecs' {
    export interface Resources {
        [workers]: typeof workersTraits;
    }
}

const workersTraits = Resource.register(workers, { type: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }], default: null } });
