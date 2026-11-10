// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { TypedArrays } from '../schema/schema.js';

/** The typed arrays a resource may be. */
export type TypedArray = TypedArrays[keyof TypedArrays];

/** The methods that assign a typed array's elements. */
type Assigning = "set" | "fill" | "copyWithin" | "reverse" | "sort";

/**
 * Typed array `T` without element assignment: its elements, `length`, iteration and every method that leaves them as
 * they are, `subarray` viewing them read-only too, `slice` copying them into a typed array of its own.
 */
export type ReadonlyTypedArray<T extends TypedArray> =
    { readonly [K in keyof T as K extends Assigning | "subarray" ? never : K]: T[K] }
    & { subarray(begin?: number, end?: number): ReadonlyTypedArray<T> };

/** `V`, read-only where it's a typed array. */
export type ReadonlyArrays<V> = V extends TypedArray ? ReadonlyTypedArray<V> : V;
