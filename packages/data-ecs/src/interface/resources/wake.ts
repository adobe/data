import { Resource } from '../resource/resource.js';

/**
 * The earliest `clock.now`, in milliseconds, at which a system asked for the next tick, by contributing to it; Infinity
 * for none. The first beat at or after it runs a tick.
 */
export const wake = Symbol("wake");

declare module '@adobe/data-ecs' {
    export interface Resources {
        [wake]: { type: number; reduce: "min" };
    }
}

Resource.register(wake, { type: { type: "number", default: Infinity }, reduce: "min" });
