import type { Schema } from '../schema/schema.js';
import type { System } from './system.js';

type ValueOf<A> = A extends Schema ? Schema.ToType<A> : never;

/** What `run` takes after a system: nothing, or one value of its `input` schema. */
export type Input<S extends System> =
    S extends { readonly declaration: { readonly input: infer A } } ? [input: ValueOf<A>] : [];
