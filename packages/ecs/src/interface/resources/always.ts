// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Resource } from '../resource/resource.js';

/** Whether every beat of the cadence runs a tick, not only beats where `wake` is due or a run arrived. False by default. */
export const always = Symbol("always");

declare module '@adobe/ecs' {
    export interface Resources {
        [always]: { type: boolean };
    }
}

Resource.register(always, { type: { type: "boolean", default: false } });
