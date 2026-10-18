import type { Schema } from '../schema/schema.js';
import type { ObjectType } from './object.js';

/** The value type a declaration's `type` gives: the type `object<T>()` states, or the one a schema describes. */
export type ValueOf<S> =
    [S] extends [ObjectType<infer T>] ? T :
    // Only a declaration that isn't one, inferred as the whole Schema union, has a type that isn't a schema literal.
    [S] extends [Schema] ? (Schema extends S ? unknown : Schema.ToType<S>) :
    unknown;

/**
 * The augment entry a declaration makes: its traits, `type` as the value type. `default` is the value an object
 * starts at, not a trait. `register` returns it written out, so declarations emitted for its result name no alias.
 */
export type Entry<D> = { readonly [T in keyof D as T extends "default" ? never : T]: T extends "type" ? ValueOf<D[T]> : D[T] };
