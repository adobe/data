// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Assert } from "./types/assert.js";

export type Primitive = string | number | boolean | null;

/** invariant type-equality check (handles `readonly` correctly) */
export type EqualReadonly<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends
  (<T>() => T extends Y ? 1 : 2)
  ? (<T>() => T extends Y ? 1 : 2) extends
  (<T>() => T extends X ? 1 : 2)
  ? true
  : false
  : false;

/** are *all* own props already `readonly`?  */
export type IsFullyReadonly<T> = EqualReadonly<T, Readonly<T>>;

export type IsData<T> =
  // primitives
  [T] extends [Primitive]
  ? true
  // **readonly** arrays whose items are Data
  : T extends ReadonlyArray<infer U>
  ? EqualReadonly<T, ReadonlyArray<U>> extends true
  ? IsData<U>
  : false
  // plain objects: 1) fully readonly, 2) every value is Data
  : T extends object
  ? IsFullyReadonly<T> extends true
  ? { [K in keyof T]-?: IsData<T[K]> }[keyof T] extends false
  ? false
  : true
  : false
  : false;

// Compile time tests

interface Foo {
  x: number;          // mutable  ❌
}

interface Bar {
  readonly x: number; // readonly ✔️
}

type IsFooData = Assert<EqualReadonly<IsData<Foo>, false>>; // false
type IsBarData = Assert<EqualReadonly<IsData<Bar>, true>>; // true