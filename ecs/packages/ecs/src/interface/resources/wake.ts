// © 2026 Adobe. MIT License. See /LICENSE for details.
import { registerResource } from '../registry/declarations.js';

/**
 * The earliest `clock.now`, in milliseconds, at which a system asked for the next tick, by contributing to it; Infinity
 * for none. The first beat at or after it runs a tick.
 */
export const wake = Symbol("wake");

declare module '@adobe/ecs' {
    export interface Resources {
        [wake]: { type: number; reduce: "min" };
    }
}

registerResource(wake, { type: { type: "number" }, reduce: "min", default: Infinity });
