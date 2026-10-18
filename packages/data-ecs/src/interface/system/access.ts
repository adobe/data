import type { Component } from '../component/component.js';
import type { Resource } from '../resource/resource.js';
import type { Writable } from '../component/value.js';
import type { Condition } from '../resource/condition.js';
import type { Reduced } from '../resource/reduction.js';
import type { WorldWritten } from '../resource/written.js';

/**
 * Matches every component in `read`, `write`, `has`, `added` and `changed`, and excludes `not`. A component in `write`
 * is also readable, so it's never listed in `read` as well.
 */
export type ComponentAccess = {
    readonly read?: readonly Component.Key[];
    /** A component holding a `reference` changes only through commands, so it can't be written here. */
    readonly write?: readonly Writable[];
    readonly has?: readonly Component.Key[];
    readonly not?: readonly Component.Key[];
    /** Passes rows where any of these were added since the system last ran. */
    readonly added?: readonly Component.Key[];
    /** Passes rows where any of these may have changed since the system last ran. */
    readonly changed?: readonly Component.Key[];
};

/** Read-only access to other entities, by entity only. */
export type Lookup = Pick<ComponentAccess, "read" | "has" | "not">;

/**
 * The parent each row's values flow down from: the entity its `through` reference names, read before the row. Rows
 * run parent first, so a parent's value is the one written earlier in the same run, and `read` may name components the
 * system writes.
 */
export type Up = { readonly through: Component.With<"reference">; readonly read?: readonly Component.Key[] };

/**
 * A resource in `write` is also readable, so it's never listed in `read` as well. Reduced resources are never written,
 * nor are those only the world writes.
 */
export type ResourceAccess = {
    readonly read?: readonly Resource.Key[];
    readonly write?: readonly Exclude<Resource.Key, Reduced | WorldWritten>[];
    /** Passes every row when any of these changed since the system last ran. */
    readonly changed?: readonly Resource.Key[];
    /** Runs only while each of these is neither `null` nor `false`, and reads it as such. Otherwise it's skipped, successfully. */
    readonly is?: readonly Condition[];
    /** Runs only while each of these is `null` or `false`. Otherwise it's skipped, successfully. */
    readonly not?: readonly Condition[];
};
