// © 2026 Adobe. MIT License. See /LICENSE for details.
import { registerResource } from '../registry/declarations.js';

/**
 * The current tick, written only by the world before each tick: `now`, the beat's time in milliseconds, `delta`, the
 * milliseconds since the previous tick (`step` under a fixed cadence), and `tick`, how many ticks ran before.
 */
export const clock = Symbol("clock");

declare module '@adobe/ecs' {
    export interface Resources {
        [clock]: { type: { readonly now: number; readonly delta: number; readonly tick: number } };
    }
}

registerResource(clock, {
    type: { type: "object", properties: { now: { type: "number" }, delta: { type: "number" }, tick: { type: "number" } } },
    default: { now: 0, delta: 0, tick: 0 },
});
