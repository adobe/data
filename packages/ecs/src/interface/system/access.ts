// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from '../component/component.js';
import type { Resource } from '../resource/resource.js';
import type { Condition } from '../resource/condition.js';
import type { Index } from '../indexes/index-type.js';

/**
 * The entities a system runs over: those with every component in `with`, `added` and `changed`, and none in `not`.
 * What its body reads and writes of them the build infers from the body.
 */
export type ComponentAccess = {
    readonly with?: readonly Component.Key[];
    /** Components its rows hold where an entity has them, `undefined` where it doesn't; they never narrow what it matches. */
    readonly optional?: readonly Component.Key[];
    readonly not?: readonly Component.Key[];
    /** Passes rows where any of these were added since the system last ran. */
    readonly added?: readonly Component.Key[];
    /** Passes rows where any of these may have changed since the system last ran. */
    readonly changed?: readonly Component.Key[];
};

/**
 * Read-only access to other entities: by entity, matching `with` and `not`, its `optional` components read where an
 * entity has them, or through an index by key, whose rows hold what every entity the index holds has. What the body reads of them the build infers. A lookup by entity's
 * `changed` names components in `with`, whose changes its row's `changed` reports, and an index lookup's those of its
 * rows. Both report as a system's `changed` filter does; its system can't write a key part or what it reads.
 */
export type Lookup =
    | { readonly with?: readonly Component.Key[]; readonly optional?: readonly Component.Key[]; readonly not?: readonly Component.Key[]; readonly changed?: readonly Component.Key[]; readonly index?: never }
    | { readonly index: Index; readonly changed?: readonly Component.Key[]; readonly with?: never; readonly optional?: never; readonly not?: never };

/**
 * A system's lookup. An index lookup's `changed: true` makes the index a change filter, as a resource in `changed` is:
 * every row passes when an entity entered or left the index, or moved to another key or position in it, since the
 * system last ran. A system whose only change filters these are runs only then, skipped before its body otherwise, as
 * when a condition fails, keeping its `lastRun`. Its lists' `changed` then reports those changes alone. Only on the
 * world's thread.
 */
export type SystemLookup = Lookup | { readonly index: Index; readonly changed: true };

/**
 * The parent each row's values flow down from: the entity its `through` reference names, read before the row. Rows
 * run parent first, so a parent's value is the one written earlier in the same run. The context's `up` holds the
 * parent's values the body reads, or null for a row without a parent or whose parent lacks one of them.
 */
export type Up = { readonly through: Component.With<"reference"> };

/** The resources a system filters and is conditioned on; what its body reads, writes and reduces the build infers. */
export type ResourceAccess = {
    /** Passes every row when any of these changed since the system last ran. */
    readonly changed?: readonly Resource.Key[];
    /** Runs only while each of these is neither `null` nor `false`, and reads it as such. Otherwise it's skipped, successfully. */
    readonly is?: readonly Condition[];
    /** Runs only while each of these is `null` or `false`. Otherwise it's skipped, successfully. */
    readonly not?: readonly Condition[];
};

/** A key, as the world takes declarations: their lists come from the build, untyped. */
type Key = symbol;

/**
 * What a system reads and writes, as the world takes it: the build's inferred access joined with its declaration.
 * Matches every component in `read`, `write`, `has`, `added` and `changed` but those in `optional`, and excludes `not`.
 */
export type ComponentLists = {
    /** Members its rows hold only where an entity has them; those it uses are in `read` or `write` too. */
    readonly optional?: readonly Key[];
    readonly read?: readonly Key[];
    readonly write?: readonly Key[];
    readonly has?: readonly Key[];
    readonly not?: readonly Key[];
    readonly added?: readonly Key[];
    readonly changed?: readonly Key[];
};

/** A lookup as the world takes it, with what its body reads of its rows in `read`. */
export type LookupLists =
    | { readonly read?: readonly Key[]; readonly has?: readonly Key[]; readonly optional?: readonly Key[]; readonly not?: readonly Key[]; readonly changed?: readonly Key[] }
    | { readonly index: Index; readonly read?: readonly Key[]; readonly changed?: readonly Key[] };

export type SystemLookupLists = LookupLists | { readonly index: Index; readonly read?: readonly Key[]; readonly changed: true };

export type UpLists = { readonly through: Key; readonly read?: readonly Key[] };

/** A system's resources as the world takes them. */
export type ResourceLists = {
    readonly read?: readonly Key[];
    readonly write?: readonly Key[];
    readonly reduce?: readonly Key[];
    readonly changed?: readonly Key[];
    readonly is?: readonly Key[];
    readonly not?: readonly Key[];
};
