// © 2026 Adobe. MIT License. See /LICENSE for details.
import { declareResource } from '../registry/declare.js';

/** The kernel pool's size, 0 for none, or `null`, the default, for the platform's choice. The pool follows it at sync points. */
export const workers = Symbol("workers");

declare module '@adobe/ecs' {
    export interface Resources {
        [workers]: { type: number | null };
    }
}

declareResource(workers, { type: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }], default: null } });
