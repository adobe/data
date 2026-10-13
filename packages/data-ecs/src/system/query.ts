import type { Component } from '../component/component.js';
import type { Resource } from '../resource/resource.js';

/** Matches every component in `read`, `write`, `has`, `added` and `changed`, and excludes `not`. */
export type Query = {
    readonly read?: readonly Component.Name[];
    /** A component holding a `reference` changes only through commands, so it can't be written here. */
    readonly write?: readonly Component.Writable[];
    readonly has?: readonly Component.Name[];
    readonly not?: readonly Component.Name[];
    /** Passes rows where any of these were added since the system last ran. */
    readonly added?: readonly Component.Name[];
    /** Passes rows where any of these may have changed since the system last ran. */
    readonly changed?: readonly Component.Name[];
};

/** Read-only access to other entities, by entity only. */
export type Lookup = Pick<Query, "read" | "has" | "not">;

/** How a reduction combines values, leaf by leaf: a sum, a product, the least or greatest, or a bitwise fold. */
export type Reduction = "+" | "*" | "min" | "max" | "&" | "|" | "^";

export type Resources = {
    readonly read?: readonly Resource.Name[];
    readonly write?: readonly Resource.Name[];
    /** Passes every row when any of these changed since the system last ran. */
    readonly changed?: readonly Resource.Name[];
    /**
     * Resources the system computes as a fold of the values its body contributes, with `context[resource](value)`.
     * After each run a resource holds the fold of that run's contributions, from the operator's identity.
     */
    readonly reduce?: { readonly [K in Resource.Name]?: Reduction };
};
