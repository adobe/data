// © 2026 Adobe. MIT License. See /LICENSE for details.

type SingletonKeys<S> = { [K in keyof S]: S[K] extends ReadonlyMap<unknown, unknown> ? never : K }[keyof S];
type EntityValueKeys<S> = { [K in keyof S]: S[K] extends ReadonlyMap<unknown, infer V> ? keyof V : never }[keyof S];

// The naming contract between a `State` and the feature's `data/` declarations, as a
// pin: every singleton key names a resource, and every entity value key names a
// component (a `ReadonlyMap` field is an entity collection). Conformance reads schemas
// by those names, so a mismatch would silently skip reference comparison.
//
//   type _ = Assert<Conformance.StateMatches<State, typeof resources, typeof components>>;
export type StateMatches<S, Resources, Components> = [Exclude<SingletonKeys<S>, keyof Resources>] extends [never]
  ? [Exclude<EntityValueKeys<S>, keyof Components>] extends [never]
    ? true
    : { readonly __stateError: "an entity value key is not a component"; readonly keys: Exclude<EntityValueKeys<S>, keyof Components> }
  : { readonly __stateError: "a singleton key is not a resource"; readonly keys: Exclude<SingletonKeys<S>, keyof Resources> };
