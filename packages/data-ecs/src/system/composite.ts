import type { Definition } from './definition.js';
import type { Name } from './name.js';
import type { System } from './system.js';

type Ordering = {
    /** Hard constraint, applied to every member. */
    readonly before?: readonly Name[];
    /** Hard constraint, applied to every member. */
    readonly after?: readonly Name[];
    /** Soft constraint, applied to every member. */
    readonly during?: readonly Name[];
};

/** Members take no input, since a composite's run passes none. */
export type CompositeDeclaration = { readonly name: Name; readonly systems: readonly System[] } & Ordering;

/** A system made of subsystems; members are flattened and ordered by their constraints. */
export type Composite = {
    readonly kind: "composite";
    readonly declaration: { readonly name: Name; readonly systems: readonly Definition[] } & Ordering;
};
