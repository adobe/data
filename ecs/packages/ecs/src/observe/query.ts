// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from '../interface/index.js';

type Comparison<T> = {
    readonly "=="?: T;
    readonly "!="?: T;
    readonly "<"?: T;
    readonly ">"?: T;
    readonly "<="?: T;
    readonly ">="?: T;
};

type ValuesOf<C extends readonly Component.Key[]> = { readonly [K in C[number]]: Component.Value<K> };

/**
 * Entities that have every component in `required`, every entity but the resource entity without it, and none in
 * `not`, filtered by `where`, a plain value meaning equality, and sorted by `order`, `true` for ascending, both naming
 * only required components; then sliced by `page`.
 */
export type Query<R extends readonly Component.Key[]> = {
    readonly required?: R;
    readonly not?: readonly Component.Key[];
    readonly where?: { readonly [K in keyof ValuesOf<R>]?: ValuesOf<R>[K] | Comparison<ValuesOf<R>[K]> };
    readonly order?: { readonly [K in keyof ValuesOf<R>]?: boolean };
    /** Only these results, after `where` and `order`. Without `order` they follow entity order. */
    readonly page?: { readonly offset: number; readonly limit: number };
};
