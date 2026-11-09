// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from '../component/component.js';

/** Bounds a number passes where each one given holds: `{ ">=": 0, "<": 10 }`. */
export type Bounds = {
    readonly "<"?: number;
    readonly "<="?: number;
    readonly ">"?: number;
    readonly ">="?: number;
    readonly "!=="?: number;
};

/**
 * What a value of type `T` matches: a value of it; for a number, bounds too; for a struct or tuple, matches of any of
 * its members, the others left free.
 */
export type Matching<T> = T extends number ? T | Bounds
    : T extends readonly unknown[] ? T | { readonly [I in Extract<keyof T, `${number}`>]?: Matching<T[I]> }
    : T extends object ? { readonly [P in keyof T]?: Matching<T[P]> }
    : T;

/** For each component a `where` names, what its value matches. */
export type WhereMatching = { readonly [K in Component.Key]?: Matching<Component<K>> };
