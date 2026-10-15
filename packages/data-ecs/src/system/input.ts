import type { Schema } from '../schema/schema.js';

/** The input a system declares: a value of its `input` schema, or `undefined` without one. */
export type InputOf<D> = D extends { readonly input: infer A extends Schema } ? Schema.ToType<A> : undefined;

/** What `run` takes after a system: nothing, or one value. */
export type Input<I> = [I] extends [undefined] ? [] : [input: I];
