import type { Name } from './name.js';
import type { System } from './system.js';

/** Members take no input, since a composite's run passes none. */
export type CompositeDeclaration = {
    readonly name: Name;
    readonly systems: readonly System[];
    /** Hard constraint, applied to every member. */
    readonly before?: readonly System<Name, unknown>[];
    /** Hard constraint, applied to every member. */
    readonly after?: readonly System<Name, unknown>[];
    /** Soft constraint, applied to every member. */
    readonly during?: readonly System<Name, unknown>[];
};

/** A system made of subsystems; members are flattened and ordered by their constraints. */
export type Composite = { readonly kind: "composite"; readonly name: Name; readonly declaration: CompositeDeclaration };
