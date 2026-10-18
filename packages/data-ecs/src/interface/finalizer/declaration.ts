import type { Component } from '../component/component.js';
import type { Resource } from '../resource/resource.js';
import type { Lookup } from '../system/access.js';
import type { Finalizer } from './finalizer.js';
import type { Name } from './name.js';
import type { Essential } from '../component/value.js';
import type { Reduced } from '../resource/reduction.js';
import type { WorldWritten } from '../resource/written.js';

type Shared = {
    readonly name?: Name;
    /** Read-only access to other entities, as they are before the sync point applies. */
    readonly lookup?: { readonly [name: string]: Lookup };
    /** Writes take the sync point's tick, so each system sees them once. A resource in `write` is also readable. */
    readonly resources?: { readonly read?: readonly Resource.Key[]; readonly write?: readonly Exclude<Resource.Key, Reduced | WorldWritten>[] };
    readonly before?: readonly Finalizer[];
    readonly after?: readonly Finalizer[];
};

/** A finalizer that runs for each entity that stops matching its components. */
export type Declaration = Shared & {
    readonly components: { readonly read?: readonly Component.Key[]; readonly has?: readonly Component.Key[]; readonly not?: readonly Component.Key[] };
};

/** A finalizer that sees each sync point's structural changes to the components it watches: every one that isn't derived, by default. */
export type ChangesDeclaration = Shared & { readonly watch?: readonly Essential[] };
