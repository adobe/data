// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { System } from './system.js';

/** How many parameters come before a body's input: the row and the context, or the context alone. */
type Before<D> = D extends { readonly components: object } ? 2 : 1;

/** The input body `B` of declaration `D` takes: the type of its parameter after the context, or `undefined` without one. */
export type InputOf<D, B> = B extends (...parameters: infer P) => void ? P["length"] extends Before<D> ? undefined : P[Before<D>] : undefined;

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
