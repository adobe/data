// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { System } from './system.js';

/** Each run passes every member the same input, with the fields of all their inputs. */
export type CompositeDeclaration = {
    readonly systems: readonly System<unknown>[];
    /** Hard constraint, applied to every member. */
    readonly before?: readonly System<unknown>[];
    /** Hard constraint, applied to every member. */
    readonly after?: readonly System<unknown>[];
    /** Runs inside the span of the systems listed: after what they follow and before what follows them. Applied to every member. */
    readonly during?: readonly System<unknown>[];
};
