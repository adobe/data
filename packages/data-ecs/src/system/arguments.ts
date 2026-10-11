import type { Schema } from '../schema/schema.js';
import type { System } from './system.js';

type ValueOf<A> = A extends Schema ? Schema.ToType<A> : never;

/** The arguments `run` takes for a system: none, or one value of its `args` schema. */
export type Arguments<S extends System> =
    S extends { readonly declaration: { readonly args: infer A } } ? [args: ValueOf<A>] : [];
