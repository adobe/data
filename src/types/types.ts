/*MIT License

© Copyright 2025 Adobe. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/

/* eslint-disable @typescript-eslint/no-unused-vars -- we have many compile time checks which are unused */

/**
 * Excludes all properties that have value type never.
 */
export type NoNever<T> = {
  [K in keyof T as T[K] extends never ? never : K]: T[K];
};

/**
 * Expands the type so when viewing in the editor, it shows all properties.
 */
export type Expand<T> = T extends {} ? T extends infer O ? { [K in keyof O]: O[K] } : T : T;

export type Branded = { __brand: any };

/**
 * Extracts all function properties that return void.
 */
export type VoidFunctions<T> = NoNever<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- safe usage.
  [K in keyof T]: T[K] extends (...args: any[]) => infer R
  ? IsVoid<R> extends true
  ? T[K]
  : never
  : never;
}>;

/**
 * @internal
 */
export type Primitive = string | number | boolean | null | undefined;


/* eslint-disable @typescript-eslint/no-unused-vars -- we have many compile time checks which are unused */

export type KeysWithValueType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

export type StringKeyof<T> = Extract<keyof T, string>;

export type IsVoid<T> = [void] extends [T]
  ? T extends void
  ? true
  : false
  : false;
//  tuple types prevent typescript from distributing over union types
export type IsTrue<T> = [T] extends [true]
  ? [true] extends [T]
  ? true
  : false
  : false;
{
  type CheckIsTrueTrueIsTrue = True<IsTrue<true>>;
  type CheckIsTrueFalseIsFalse = False<IsTrue<false>>;
  type CheckIsTrueBooleanIsFalse = False<IsTrue<boolean>>;
}

export type Not<T> = [T] extends [false]
  ? true
  : [T] extends [true]
  ? false
  : boolean;
{
  type CheckNotFalseIsTrue = True<Not<false>>;
  type CheckNotTrueIsFalse = False<Not<true>>;
  type CheckNotBooleanIsBoolean = True<EquivalentTypes<Not<boolean>, boolean>>;
}

export type False<A extends false> = A extends boolean ? true : true;
export type True<A extends true> = A extends boolean ? true : true;
export type Extends<A, B> = [A] extends [B] ? true : false;

export type EquivalentTypes<A, B> = [A] extends [B]
  ? [B] extends [A]
  ? true
  : false
  : false;

export type AnyFunction = (...args: unknown[]) => unknown;

/**
 * @internal
 */
export type IsUnknown<T> = unknown extends T
  ? T extends unknown
  ? T extends
  | string
  | number
  | boolean
  | symbol
  | bigint
  | null
  | undefined
  | object
  | AnyFunction
  ? false
  : true
  : never
  : false;


export type DeepReadonly<T> = T extends Function | Branded | Element | Blob
  ? T
  : T extends Array<infer U>
  ? IsTuple<T> extends true
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> } // T is a tuple
  : ReadonlyArray<DeepReadonly<U>> // T is an array
  : T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;

export type IsTuple<T> = T extends readonly [...infer Elements]
  ? number extends T['length']
  ? false
  : true
  : false;

export type Simplify<T> = T extends object ? { [K in keyof T]: T[K] } : T;

export type IsNever<T> = [T] extends [never] ? true : false;

export type RequiredKeys<T extends object> = {
  // eslint-disable-next-line @typescript-eslint/ban-types -- we need {} to represent object
  [K in keyof T]-?: {} extends { [P in K]: T[K] } ? never : K;
}[keyof T];

export type OptionalKeys<T extends object> = Exclude<
  {
    [K in keyof T]: T extends Record<K, T[K]> ? never : K;
  }[keyof T],
  undefined
>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed for dynamic type
export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never;

export type NoUnion<Key> = [Key] extends [UnionToIntersection<Key>]
  ? Key
  : never;

/**
 * Ensures that type U contains exactly the properties of type T, no more, no less.
 * Extra properties will cause a type error.
 */
export type Exact<T, U extends T> =
  U extends T
  ? Exclude<keyof U, keyof T> extends never
  ? U
  : never
  : never;

export type NoInfer<T> = [T][T extends any ? 0 : never];

export type IntersectTuple<T extends readonly unknown[]> =
  T extends readonly [infer H, ...infer R] ? Simplify<H & IntersectTuple<R>> : unknown;
export type UnionTuple<T extends readonly unknown[]> = Simplify<
  T extends readonly [infer H, ...infer R] ? H | UnionTuple<R> : never
>;

type C = IntersectTuple<[{ a: number }, { b: string }, { c: boolean }]>;

// Compile-time tests for Exact type
{
  type TestBase = { a: number; b: string };
  type TestExact = { a: number; b: string };
  type TestExtra = { a: number; b: string; c: boolean };

  // Should accept exact match
  type CheckExactMatch = True<Not<IsNever<Exact<TestBase, TestExact>>>>;

  // Should reject extra properties
  type CheckExtraRejected = True<IsNever<Exact<TestBase, TestExtra>>>;

  // Should accept subset (U extends T)
  type TestSubset = { a: number };
  type CheckSubsetAccepted = True<Not<IsNever<Exact<TestBase, TestBase>>>>;
}

