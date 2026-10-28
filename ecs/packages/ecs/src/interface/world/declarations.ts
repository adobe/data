// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from '../component/component.js';
import type { Components } from '../component/types.js';
import type { Resource } from '../resource/resource.js';
import type { Resources } from '../resource/types.js';
import type { Key as TraitKey } from '../trait/key.js';
import type { Traits } from '../trait/types.js';

/**
 * The members of key `K`'s declaration `Entry` that don't hold: a trait whose value `Traits<K>` doesn't allow, a name
 * that isn't a trait, and a `default` that isn't of the declared type. Checks only `K`'s own traits, so the whole check
 * is linear in the declarations.
 */
type Invalid<K extends Component.Key | Resource.Key, Entry, Value> =
    | { readonly [T in Exclude<keyof Entry, "type" | "default">]-?: T extends TraitKey ? ([Entry[T]] extends [Traits<K>[T]] ? never : T) : T }[Exclude<keyof Entry, "type" | "default">]
    | (Entry extends { readonly default: infer D } ? ([D] extends [Value] ? never : "default") : never);

/**
 * Key `K` with what's wrong with each member that doesn't hold, keyed by member so an error prints a trait by its
 * key's binding; written in place, as an alias would print by its name.
 */
type Reported<K, Members extends PropertyKey> = [Members] extends [never] ? never : {
    readonly key: K;
    readonly members: { readonly [M in Members]: M extends "default" ? "isn't of the declared type" : M extends TraitKey ? "isn't allowed on this key" : "isn't a trait" };
};

/**
 * Every declaration in `Components` and `Resources` with members that don't hold, each as its key and what's wrong
 * with those members; `never` when all hold. The build registers declarations without a type checker, so
 * `World.create` reports these.
 */
export type InvalidDeclarations =
    | { readonly [K in Component.Key]: Reported<K, Invalid<K, Components[K], Component<K>>> }[Component.Key]
    | { readonly [K in Resource.Key]: Reported<K, Invalid<K, Resources[K], Resource<K>>> }[Resource.Key];
