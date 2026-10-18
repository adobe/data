import type { Component } from '../component/component.js';
import type { Entity } from '../entity/entity.js';
import type { IsNode, IsTransferable } from '../platform/platform.js';
import type { Resource } from '../resource/resource.js';
import type { Reduction } from '../resource/reduction.js';
import type { IsStruct } from '../schema/is-struct.js';
import type { Thread } from '../thread/thread.js';

/**
 * The value each trait allows on the component or resource `N`, whose traits are `E`, `type` as its value type.
 * Augment it, with these exact type parameters, to define a trait, and register its name with `Trait.register`. A
 * trait that doesn't apply resolves to `never`. An allowed value looks at `N` only to tell components from resources
 * and at `E` for the rest, never at `Components` or `Resources` entries: registration computes `E`, so reading an
 * entry there makes the entry depend on itself.
 */
export interface Traits<N extends Component.Key | Resource.Key, E extends { readonly type: unknown }> {
    /** The value type: a schema for it when it's data, else `object<T>()`. */
    readonly type: unknown;
    /** Present only while a rule deriving it matches, so commands never add or remove it. */
    readonly derived: N extends Component.Key ? true : never;
    /** Exists only while its host component does, and is removed with it. Not on a derived component, which its rule covers. */
    readonly within: N extends Component.Key
        ? E extends { readonly derived: true } | { readonly within: N } ? never : Component.Key
        : never;
    /**
     * On an entity-valued component: when its target despawns, `owner` despawns the holder and `weak` removes the
     * component. Not on a derived component, whose target only a command could set.
     */
    readonly reference: N extends Component.Key
        ? E extends { readonly derived: true } ? never : [E["type"]] extends [Entity] ? "owner" | "weak" : never
        : never;
    /**
     * On a resource, the operator systems reduce into it with: each run that a contributor runs in starts it at the
     * operator's identity and leaves it holding the fold of every contribution. Booleans fold bitwise.
     */
    readonly reduce: N extends Resource.Key
        ? [E["type"]] extends [boolean] ? "&" | "|" | "^" : IsStruct<E["type"]> extends true ? Reduction : never
        : never;
    /**
     * The logical thread an object lives on, `"world"` without it. Not on a struct, which lives in shared memory. A DOM
     * `Node` lives on `"main"`, and says so.
     */
    readonly thread: IsStruct<E["type"]> extends true ? never : IsNode<E["type"]> extends true ? "main" : Thread;
    /** The value may be moved, never copied, to its thread: only a Transferable value. */
    readonly transfer: IsTransferable<E["type"]> extends true ? true : never;
}
