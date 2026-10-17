import type { Schema } from '../schema/schema.js';
import type { System } from './system.js';

/** The input a system declares: a value of its `input` schema, or `undefined` without one. */
export type InputOf<D> = D extends { readonly input: infer A extends Schema } ? Schema.ToType<A> : undefined;

/** What `run` takes after a system: nothing, or one value. */
export type Input<I> = [I] extends [undefined] ? [] : [input: I];

/** A member's input fields, or `unknown` without input. */
type Fields<S> = S extends System<infer I> ? [Exclude<I, undefined>] extends [never] ? unknown : Exclude<I, undefined> : unknown;

type Merged<T, A = unknown> = T extends readonly [infer S, ...infer R] ? Merged<R, A & Fields<S>> : A;

/** The input a composite of `T` takes: every field of its members' inputs, or `undefined` when none has input. */
export type CompositeInputOf<T> = unknown extends Merged<T> ? undefined : { [K in keyof Merged<T>]: Merged<T>[K] };

/** The fields of `M` whose type differs from the one the composite's input `I` gives them. */
type Conflicts<M, I> = { [K in keyof M]-?: [Exclude<M[K], undefined>] extends [Exclude<I[K & keyof I], undefined>] ? never : K }[keyof M];

type Checked<S, I> = [Conflicts<Fields<S>, I>] extends [never] ? S
    : `Input field "${Extract<Conflicts<Fields<S>, I>, string>}" has a different type in another member of this composite.`;

/** Members whose input has a field of a different type than another member's. */
export type CheckMembers<T> = { readonly [P in keyof T]: Checked<T[P], Merged<T>> };
