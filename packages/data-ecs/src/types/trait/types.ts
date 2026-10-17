import type { Component } from '../component/component.js';
import type { Components } from '../component/types.js';
import type { Entity } from '../entity/entity.js';
import type { IsNode, IsTransferable } from '../platform/platform.js';
import type { Resource } from '../resource/resource.js';
import type { Reduction } from '../resource/reduction.js';
import type { IsStruct } from '../schema/is-struct.js';
import type { Thread } from '../thread/thread.js';

/** The value type of the component or resource `N`. */
type ValueOf<N> = N extends Component.Name ? Component.Value<N> : N extends Resource.Name ? Resource.Value<N> : never;

/**
 * The value each trait allows on the component or resource `N`. Augment it, with this exact type parameter, to
 * define a trait, and register its name with `Trait.register`. A trait that doesn't apply to `N` resolves to `never`.
 * An allowed value may look at `N`'s own traits and at the one component a declared value names, never map over
 * every component, or checking grows with the square of the component count.
 */
export interface Traits<N extends Component.Name | Resource.Name> {
    /** The value type: declared as a TypeScript type, registered as a schema for it when it's data. */
    readonly type: unknown;
    /** Present only while a rule deriving it matches, so commands never add or remove it. */
    readonly derived: N extends Component.Name ? true : never;
    /** Exists only while its host component does, and is removed with it. Not on a derived component, which its rule covers. */
    readonly within: N extends Component.Name
        ? Components[N] extends { readonly derived: true } | { readonly within: N } ? never : Component.Name
        : never;
    /**
     * On an entity-valued component: when its target despawns, `owner` despawns the holder and `weak` removes the
     * component. Not on a derived component, whose target only a command could set.
     */
    readonly reference: N extends Component.Name
        ? Components[N] extends { readonly derived: true } ? never : [Component.Value<N>] extends [Entity] ? "owner" | "weak" : never
        : never;
    /**
     * On a resource, the operator systems reduce into it with: each run that a contributor runs in starts it at the
     * operator's identity and leaves it holding the fold of every contribution. Booleans fold bitwise.
     */
    readonly reduce: N extends Resource.Name
        ? [Resource.Value<N>] extends [boolean] ? "&" | "|" | "^" : IsStruct<Resource.Value<N>> extends true ? Reduction : never
        : never;
    /**
     * The logical thread an object lives on, `"world"` without it. Not on a struct, which lives in shared memory. A DOM
     * `Node` lives on `"main"`, and says so.
     */
    readonly thread: IsStruct<ValueOf<N>> extends true ? never : IsNode<ValueOf<N>> extends true ? "main" : Thread;
    /** The value may be moved, never copied, to its thread: only a Transferable value. */
    readonly transfer: IsTransferable<ValueOf<N>> extends true ? true : never;
}
