import type { Component } from '../component/component.js';
import type { Resource } from '../resource/resource.js';

/** Matches every component in `read`, `write`, `has`, `added` and `changed`, and excludes `not`. */
export type Query = {
    readonly read?: readonly Component.Name[];
    readonly write?: readonly Component.Name[];
    readonly has?: readonly Component.Name[];
    readonly not?: readonly Component.Name[];
    /** Passes rows where any of these were added since the system last ran. */
    readonly added?: readonly Component.Name[];
    /** Passes rows where any of these may have changed since the system last ran. */
    readonly changed?: readonly Component.Name[];
};

/** Read-only access to other entities, by entity only. */
export type Lookup = Pick<Query, "read" | "has" | "not">;

export type Resources = {
    readonly read?: readonly Resource.Name[];
    readonly write?: readonly Resource.Name[];
    /** Passes every row when any of these changed since the system last ran. */
    readonly changed?: readonly Resource.Name[];
};
