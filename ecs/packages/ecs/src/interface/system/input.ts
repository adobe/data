// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Property } from './property.js';
import type { System } from './system.js';

/** How many parameters come before a body's input: the row and the context, or the context alone. */
type Before<D> = D extends { readonly components: object } ? 2 : 1;

/** The input body `B` of declaration `D` takes: the type of its parameter after the context, or `undefined` without one. */
export type InputOf<D, B> = B extends (...parameters: infer P) => void ? P["length"] extends Before<D> ? undefined : P[Before<D>] : undefined;

/** Whether a declaration's conditions, resource change filters or index lookups' `changed: true` can skip its body. */
type Skippable<D> =
    D extends { readonly resources: { readonly is: object } | { readonly not: object } | { readonly changed: object } } ? true
    : true extends { [N in keyof Property<D, "lookup">]: Property<D, "lookup">[N] extends { readonly changed: true } ? true : false }[keyof Property<D, "lookup">] ? true
    : false;

/**
 * What a run of a system of declaration `D` and body `B` resolves to: for one without components, what its body
 * returns, or `undefined` too when its body may be skipped; for one with components, nothing.
 */
export type ResultOf<D, B> = D extends { readonly components: object } ? void
    : B extends (...parameters: never[]) => infer R ? [R] extends [void] ? R : Skippable<D> extends true ? R | undefined : R : void;

/** Whether `R` is exactly `unknown` or `object`, return types wide enough to hide a promise. */
type Hides<R> = unknown extends R ? true
    : [R] extends [object] ? [object] extends [R] ? [keyof R] extends [never] ? string extends R ? false : true : false : false : false;

/**
 * A body returning a promise or another `PromiseLike`, or declared to return `unknown` or `object`, which may be one,
 * becomes the error saying it returns none: a run never waits for one, so a body starts the work and a later run
 * finishes it. Types can't tell a body returning `any`, nor an async function typed as returning `void`.
 */
export type ReturnsNoPromise<B> = B extends (...parameters: never[]) => infer R
    ? 0 extends (1 & R) ? unknown
    : [Extract<R, PromiseLike<unknown>>] extends [never] ? Hides<R> extends true ? NoPromise : unknown
    : NoPromise
    : unknown;

type NoPromise = { readonly "error: a body returns no promise; start the work, and finish it in a later run": true };

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
