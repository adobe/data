import type { Component } from '../component/component.js';
import type { Resource } from '../resource/resource.js';
import type { Writable } from '../component/value.js';
import type { Condition } from '../resource/condition.js';
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

/** A resource in `write` is also readable, so it's never listed in `read` as well. Reduced resources are never written. */
export type ResourceAccess = {
    readonly read?: readonly Resource.Name[];
    readonly write?: readonly Exclude<Resource.Name, Reduced>[];
    /** Passes every row when any of these changed since the system last ran. */
    readonly changed?: readonly Resource.Name[];
    /** Runs only while each of these is neither `null` nor `false`, and reads it as such. Otherwise it's skipped, successfully. */
    readonly is?: readonly Condition[];
    /** Runs only while each of these is `null` or `false`. Otherwise it's skipped, successfully. */
    readonly not?: readonly Condition[];
};
