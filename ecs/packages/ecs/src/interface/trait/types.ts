// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from '../component/component.js';
import type { Components } from '../component/types.js';
import type { Entity } from '../entity/entity.js';
import type { IsNode, IsTransferable } from '../platform/platform.js';
import type { Resource } from '../resource/resource.js';
import type { Reduction } from '../resource/reduction.js';
import type { IsComparable, IsString, IsStruct } from '../schema/is-struct.js';
import type { Thread } from '../thread/thread.js';

/** The value type of the component or resource `N`. */
type ValueOf<N> = N extends Component.Key ? Component<N> : N extends Resource.Key ? Resource<N> : never;

/**
 * Whether each component's and resource's value is a struct, `"string"` for a string, computed once so a check is a
 * lookup. Its keys are remapped (`as K`) so a generic key's lookup stays one: resolved as `IsStruct` of a generic value,
 * as a registration resolves its contextual type, it recurses without end.
 */
type Structs = { readonly [K in Component.Key | Resource.Key as K]: IsString<ValueOf<K>> extends true ? "string" : IsStruct<ValueOf<K>> };

/**
 * The value each trait allows on the component or resource `N`. Augment it, with this exact type parameter, to
 * define a trait, keyed by a `Symbol()` constant of the same module, which the build registers. A trait that doesn't
 * apply to `N` resolves to `never`.
 * An allowed value may look at `N`'s own traits and at the one component a declared value names, never map over
 * every component, or checking grows with the square of the component count.
 */
export interface Traits<N extends Component.Key | Resource.Key> {
    /** The value type: declared as a TypeScript type, registered as a schema for it when it's data. */
    readonly type: unknown;
    /** Present only while a rule deriving it matches, so commands never add or remove it. Not on a shared component. */
    readonly derived: N extends Component.Key ? Components[N] extends { readonly shared: true } ? never : true : never;
    /** Exists only while its host component does, and is removed with it. Not on a derived component, which its rule covers. */
    readonly within: N extends Component.Key
        ? Components[N] extends { readonly derived: true } | { readonly within: N } ? never : Component.Key
        : never;
    /**
     * On an entity-valued component: when its target despawns, `owner` despawns the holder and `weak` removes the
     * component. Not on a derived component, whose target only a command could set.
     */
    readonly reference: N extends Component.Key
        ? Components[N] extends { readonly derived: true } | { readonly shared: true } ? never : [Component<N>] extends [Entity] ? "owner" | "weak" : never
        : never;
    /**
     * On a resource, the operator systems reduce into it with: each run that a contributor runs in starts it at the
     * operator's identity and leaves it holding the fold of every contribution. Booleans fold bitwise.
     */
    readonly reduce: N extends Resource.Key
        ? [Resource<N>] extends [boolean] ? "&" | "|" | "^" : Structs[N] extends true ? Reduction : never
        : never;
    /**
     * The logical thread an object lives on, `"world"` without it. Not on a struct or a string, which live in shared
     * memory. A DOM `Node` lives on `"main"`, and says so.
     */
    readonly thread: Structs[N] extends true | "string" ? never
        : N extends Component.Key ? Components[N] extends { readonly shared: true } ? never : IsNode<ValueOf<N>> extends true ? "main" : Thread
        : IsNode<ValueOf<N>> extends true ? "main" : Thread;
    /** The value may be moved, never copied, to its thread: only a Transferable value. */
    readonly transfer: IsTransferable<ValueOf<N>> extends true ? true : never;
    /**
     * On a component of comparable data (numbers, booleans, strings, arrays and plain objects of those): each archetype
     * holds one value of it for every entity it holds, so entities of equal values share an archetype. Rows read it as
     * their archetype's value; `commands.add` with another value moves the entity. Not on a derived component or a
     * reference, and it has no thread: every thread reads it.
     */
    readonly shared: N extends Component.Key
        ? Components[N] extends { readonly derived: true } | { readonly reference: unknown } ? never : IsComparable<Component<N>> extends true ? true : never
        : never;
}
