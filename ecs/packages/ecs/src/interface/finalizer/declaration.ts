// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from '../component/component.js';
import type { SystemLookupLists, ResourceLists } from '../system/access.js';
import type { Lookup } from '../system/access.js';
import type { Finalizer } from './finalizer.js';
import type { Essential } from '../component/value.js';
import type { Resource } from '../resource/resource.js';
import type { Traits } from '../trait/types.js';
import type { BuiltIn } from '../trait/key.js';

/**
 * What every finalizer declares. What its body reads of its row and lookups, and reads and writes of resources, the
 * build infers; resource writes take the sync point's tick, so each system sees them once.
 */
type Shared = {
    /** Read-only access to other entities, as they are before the sync point applies. */
    readonly lookup?: { readonly [name: string]: Lookup };
    readonly before?: readonly Finalizer[];
    readonly after?: readonly Finalizer[];
};

/**
 * A finalizer that runs for each entity that stops matching its components: those with every one in `with` and none in
 * `not`. Its `optional` components, which never decide a stop, its row reads where the entity had them.
 */
export type Declaration = Shared & {
    readonly components: { readonly with?: readonly Component.Key[]; readonly optional?: readonly Component.Key[]; readonly not?: readonly Component.Key[] };
};

/** A trait of your own, which watches every component and resource declaring it. */
export type OwnTrait = Exclude<keyof Traits<never>, BuiltIn>;

/**
 * A finalizer that sees each sync point's structural changes to the components it watches, and the resources it
 * watches written since the last sync point's finalizers ran. By default it watches every component that isn't derived
 * or an object a joined thread fills, and no resource. `watch` lists components, resources and traits of your own, or,
 * as an object, every component (`components: true`) or those listed, beside the resources listed. A trait watches each
 * component and resource declaring it, as each registers, but those the default leaves out and resources on another
 * thread.
 */
export type ChangesDeclaration = Shared & {
    readonly watch?: readonly (Essential | Resource.Key | OwnTrait)[] | {
        readonly components: true | readonly (Essential | OwnTrait)[];
        readonly resources: readonly (Resource.Key | OwnTrait)[];
    };
};

type Key = symbol;

/** What every finalizer's declaration holds as the world takes it, with what the build inferred its body uses. */
type ResolvedShared = {
    readonly lookup?: { readonly [name: string]: SystemLookupLists };
    readonly resources?: Pick<ResourceLists, "read" | "write">;
    readonly before?: readonly Finalizer[];
    readonly after?: readonly Finalizer[];
};

/** A finalizer's declaration as the world takes it: what its body reads of its row in `read`, the rest of `with` in `has`. */
export type Resolved = ResolvedShared & {
    readonly components: { readonly read?: readonly Key[]; readonly has?: readonly Key[]; readonly optional?: readonly Key[]; readonly not?: readonly Key[] };
};

/**
 * A changes finalizer's declaration as the world takes it. It watches the components listed, or every one (`true`),
 * and those declaring a trait of `componentTraits`; the resources listed, and those declaring a trait of
 * `resourceTraits`.
 */
export type ResolvedChanges = ResolvedShared & {
    readonly watch: {
        readonly components: true | readonly Key[];
        readonly componentTraits: readonly Key[];
        readonly resources: readonly Key[];
        readonly resourceTraits: readonly Key[];
    };
};
