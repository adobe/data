// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from '../component/component.js';
import type { SystemLookupLists, ResourceLists } from '../system/access.js';
import type { Lookup } from '../system/access.js';
import type { Finalizer } from './finalizer.js';
import type { Essential } from '../component/value.js';

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

/** A finalizer that runs for each entity that stops matching its components: those with every one in `with` and none in `not`. */
export type Declaration = Shared & {
    readonly components: { readonly with?: readonly Component.Key[]; readonly not?: readonly Component.Key[] };
};

/**
 * A finalizer that sees each sync point's structural changes to the components it watches: by default, every one that
 * isn't derived or an object a joined thread fills.
 */
export type ChangesDeclaration = Shared & { readonly watch?: readonly Essential[] };

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
    readonly components: { readonly read?: readonly Key[]; readonly has?: readonly Key[]; readonly not?: readonly Key[] };
};

export type ResolvedChanges = ResolvedShared & { readonly watch?: readonly Key[] };
