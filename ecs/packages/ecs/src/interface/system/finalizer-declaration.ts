// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from '../component/component.js';
import type { Lookup } from './access.js';
import type { System } from './system.js';
import type { Essential } from '../component/value.js';
import type { Resource } from '../resource/resource.js';
import type { Traits } from '../trait/types.js';
import type { BuiltIn } from '../trait/key.js';

/** A changes or removed system, as `System.changes` and `System.removed` type them: one `run` never takes. */
export type Finalizing = System<never>;

/**
 * What every changes and removed system declares. What its body reads of its row and lookups, and reads and writes of
 * resources, the build infers; resource writes take the sync point's tick, so each system sees them once. `before`
 * and `after` order it with other changes and removed systems added to the same world.
 */
type Shared = {
    /** Read-only access to other entities, as they are before the sync point applies. */
    readonly lookup?: { readonly [name: string]: Lookup };
    readonly before?: readonly Finalizing[];
    readonly after?: readonly Finalizing[];
};

/**
 * A removed system, which runs for each entity that stops matching its components: those with every one in `with` and none in
 * `not`. Its `optional` components, which never decide a stop, its row reads where the entity had them.
 */
export type Declaration = Shared & {
    readonly components: { readonly with?: readonly Component.Key[]; readonly optional?: readonly Component.Key[]; readonly not?: readonly Component.Key[] };
};

/** A trait of your own, which watches every component and resource declaring it. */
export type OwnTrait = Exclude<keyof Traits<never>, BuiltIn>;

/**
 * A changes system, which sees each sync point's structural changes to the components it watches, and the resources it
 * watches written since its last sync point. By default it watches every component that isn't derived
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
