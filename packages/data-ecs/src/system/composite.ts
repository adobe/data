import type { Declaration } from './declaration.js';
import type { Leaf } from './leaf.js';
import type { Name } from './name.js';

/** A system that can be a member of a composite: any composite, or a leaf without arguments. */
export type Member = Composite | Leaf<Declaration & { readonly args?: undefined }>;

export type CompositeDeclaration = {
    readonly name: Name;
    readonly systems: readonly Member[];
    /** Hard constraint, applied to every member. */
    readonly before?: readonly Name[];
    /** Hard constraint, applied to every member. */
    readonly after?: readonly Name[];
    /** Soft constraint, applied to every member. */
    readonly during?: readonly Name[];
};

/** A system made of subsystems; members are flattened and ordered by their constraints. */
export type Composite<D extends CompositeDeclaration = CompositeDeclaration> = {
    readonly declaration: D;
};
