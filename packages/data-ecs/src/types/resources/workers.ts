import { Resource } from '../resource/resource.js';

/** The kernel pool's size: the workers kernels run on in chunks, 0 for none. */
export const workers = 'workers';

declare module '@adobe/data-ecs' {
    export interface Resources {
        [workers]: { type: number };
    }
}

Resource.register(workers, { type: { type: "integer", minimum: 0, default: 0 } });
