import type { gpu } from '../resources/gpu.js';
import type { Component } from '../component/component.js';
import type { Resource } from '../resource/resource.js';
import type { Writable } from '../component/value.js';
import type { Reduced } from '../resource/reduction.js';

/**
 * Matches every component in `read`, `write`, `has`, `added` and `changed`, and excludes `not`. A component in `write`
 * is also readable, so it's never listed in `read` as well.
 */
export type ComponentAccess = {
    readonly read?: readonly Component.Name[];
    /** A component holding a `reference` changes only through commands, so it can't be written here. */
    readonly write?: readonly Writable[];
    readonly has?: readonly Component.Name[];
    readonly not?: readonly Component.Name[];
    /** Passes rows where any of these were added since the system last ran. */
    readonly added?: readonly Component.Name[];
    /** Passes rows where any of these may have changed since the system last ran. */
    readonly changed?: readonly Component.Name[];
};

/** Read-only access to other entities, by entity only. */
export type Lookup = Pick<ComponentAccess, "read" | "has" | "not">;

/**
 * A resource in `write` is also readable, so it's never listed in `read` as well. Reduced resources are never written,
 * and neither is `gpu`, which is set when the world is created.
 */
export type ResourceAccess = {
    readonly read?: readonly Resource.Name[];
    readonly write?: readonly Exclude<Resource.Name, Reduced | typeof gpu>[];
    /** Passes every row when any of these changed since the system last ran. */
    readonly changed?: readonly Resource.Name[];
};
