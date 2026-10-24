// © 2026 Adobe. MIT License. See /LICENSE for details.
import { registerResource } from '../registry/declarations.js';

/** Whether every beat of the cadence runs a tick, not only beats where `wake` is due or a run arrived. False by default. */
export const always = Symbol("always");

declare module '@adobe/ecs' {
    export interface Resources {
        [always]: { type: boolean };
    }
}

registerResource(always, { type: { type: "boolean", default: false } });
