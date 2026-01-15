// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { TypedArray } from "./typed-array.js";

/**
 * Type signature for typed array constructors.
 */
export type TypedArrayConstructor = { BYTES_PER_ELEMENT: number } & (new (
    arrayBuffer?: ArrayBufferLike,
    byteOffset?: number,
    length?: number
  ) => TypedArray);
  