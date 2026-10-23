// © 2026 Adobe. MIT License. See /LICENSE for details.
import { register } from '../resource/register.js';

/** The kernel pool's size, 0 for none, or `null`, the default, for the platform's choice. The pool follows it at sync points. */
export const workers = Symbol("workers");

declare module '../resource/types.js' {
    export interface Resources {
        [workers]: { type: number | null };
    }
}

register(workers, { type: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }], default: null } });
