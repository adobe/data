// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from '../component/component.js';

/** Components a spawn or add may leave out: a tag, whose value is `true`, and one whose type allows `null`, its start. */
type Omissible<K extends Component.Key> = Component.Value<K> extends true ? K : null extends Component.Value<K> ? K : never;

/**
 * The values a spawn or add of the components `C` takes, keyed by component and exact against `C`, but those `Given`
 * already: a tag needs no value, a component whose type allows `null` may be left out to start at `null`, and every
 * other one is required. Leaving one out, or giving `undefined`, never leaves the component out. A list that isn't a
 * tuple takes any of its components' values.
 */
export type ValuesOf<C extends readonly Component.Key[], Given extends PropertyKey = never> = number extends C["length"]
    // A list whose components aren't known until it runs, so any of them may be given.
    ? { readonly [K in Exclude<C[number], Given>]?: Component.Value<K> }
    : { readonly [K in Exclude<C[number], Given> as K extends Omissible<K> ? never : K]: Component.Value<K> }
        & { readonly [K in Exclude<C[number], Given> as K extends Omissible<K> ? K : never]?: Component.Value<K> };
