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
  // **readonly** sets whose items are Data (a mutable `Set` is not Data)
  : T extends ReadonlySet<infer U>
  ? EqualReadonly<T, ReadonlySet<U>> extends true
  ? IsData<U>
  : false
  // **readonly** maps whose keys and values are Data (a mutable `Map` is not Data)
  : T extends ReadonlyMap<infer K, infer V>
  ? EqualReadonly<T, ReadonlyMap<K, V>> extends true
  ? IsData<K> extends false ? false : IsData<V>
  : false
  // plain objects: 1) fully readonly, 2) every value (excluding the `| undefined`
  // that TypeScript adds for optional properties) is Data
  : T extends object
  ? IsFullyReadonly<T> extends true
  ? { [K in keyof T]-?: IsData<Exclude<T[K], undefined>> }[keyof T] extends false
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

interface Baz {
  readonly label: string;
  readonly count?: number; // optional ✔️ — absence is fine, undefined is not data
  readonly meta?: { readonly tag: string }; // nested optional ✔️
}

type IsFooData = Assert<EqualReadonly<IsData<Foo>, false>>; // false
type IsBarData = Assert<EqualReadonly<IsData<Bar>, true>>; // true
type IsBazData = Assert<EqualReadonly<IsData<Baz>, true>>; // true — optional props are OK

// Sets and Maps are Data when readonly and their items/keys/values are Data; a
// mutable `Set`/`Map`, or one holding non-Data, is not.
type IsReadonlySetData = Assert<EqualReadonly<IsData<ReadonlySet<number>>, true>>; // true
type IsMutableSetData = Assert<EqualReadonly<IsData<Set<number>>, false>>; // false — mutable
type IsSetOfMutableData = Assert<EqualReadonly<IsData<ReadonlySet<Foo>>, false>>; // false — element not Data
type IsReadonlyMapData = Assert<EqualReadonly<IsData<ReadonlyMap<string, Bar>>, true>>; // true
type IsMutableMapData = Assert<EqualReadonly<IsData<Map<string, number>>, false>>; // false — mutable