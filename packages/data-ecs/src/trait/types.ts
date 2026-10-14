import type { Component } from '../component/component.js';
import type { Components } from '../component/types.js';
import type { Entity } from '../entity/entity.js';
import type { Resource } from '../resource/resource.js';

/**
 * The value each trait allows on the component or resource `N`. Augment it, with this exact type parameter, to
 * define a trait, and register its name with `Trait.register`. A trait that doesn't apply to `N` resolves to `never`.
 * An allowed value may look at `N`'s own traits and at the one component a declared value names, never map over
 * every component, or checking grows with the square of the component count.
 */
export interface Traits<N extends Component.Name | Resource.Name> {
    /** The value type: declared as a TypeScript type, registered as a schema for it. */
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
}
