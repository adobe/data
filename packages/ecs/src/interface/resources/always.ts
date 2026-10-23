// © 2026 Adobe. MIT License. See /LICENSE for details.
import { register } from '../resource/register.js';

/** Whether every beat of the cadence runs a tick, not only beats where `wake` is due or a run arrived. False by default. */
export const always = Symbol("always");

declare module '../resource/types.js' {
    export interface Resources {
        [always]: { type: boolean };
    }
}

register(always, { type: { type: "boolean", default: false } });
