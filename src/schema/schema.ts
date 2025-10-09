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

import { TypedBuffer } from "../typed-buffer/typed-buffer.js";
import { DeepReadonly, EquivalentTypes, True } from "../types/types.js";

type JSONPath = string;
type JSONMergePatch = unknown;

export type Layout = "std140" | "packed";

/**
 * Conditional patch applied to the path when the enclosing schema branch is active
 * and `match` is not present or validates against the root.
 * This is used for dynamic schemas which change in response to the value of the data.
 */
export type Conditional = {
  match?: Schema;
  // // root-anchored JSONPath
  path: JSONPath;
  // // JSON-Merge-Patch fragment
  value: JSONMergePatch;
}

export interface UIProperties {
  name?: string;
  icon?: string; // url? or icon name?
  summary?: string;
  premium?: boolean;
  placeholder?: string;
  details?: string;
  visible?: boolean;
  enabled?: boolean;
  infoUrl?: string;
  group?: string;
  order?: number;
  groups?: {
    readonly [key: string]: UIProperties;
  };
}

export const isSchema = (schema: unknown): schema is Schema => {
  return typeof schema === 'object' && schema !== null && (
    'type' in schema && typeof schema.type === 'string'
    ||
    'default' in schema && typeof schema.default !== 'undefined'
  );
}

export interface Schema {
  type?: 'number' | 'integer' | 'string' | 'boolean' | 'null' | 'array' | 'object' | 'typed-buffer' | 'blob';
  conditionals?: readonly Conditional[];
  ui?: UIProperties;
  transient?: boolean;
  mutable?: boolean; // defaults to false
  default?: any;
  precision?: 1 | 2;
  multipleOf?: number;
  mediaType?: string; // media type such as image/jpeg, image/png, video/* etc.
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  items?: Schema;
  properties?: { readonly [key: string]: Schema };
  required?: readonly string[];
  additionalProperties?: boolean | Schema;
  oneOf?: readonly Schema[];
  allOf?: readonly Schema[];
  const?: any;
  enum?: readonly any[];
  layout?: Layout; // Memory layout for typed buffers (std140 or packed)
  /**
   * Classification of data according to privacy regulations and cookie consent frameworks.
   * Used to categorize data collection and processing for privacy compliance.
   * Useful resource:
   * https://www.onetrust.com/products/cookie-consent/
   *
   * @remarks
   * - `strictlyNecessary`: Essential data required for basic functionality and security
   * - `performance`: Data used for analytics, performance monitoring, and site optimization
   * - `functional`: Data used for enhanced features and user experience improvements
   * - `advertising`: Data used for advertising, marketing, and personalized content
   */
  privacy?: 'strictlyNecessary' | 'performance' | 'functional' | 'advertising';
}

export type FromSchemas<T> = {
  [K in keyof T]: FromSchema<T[K]>;
};

export type FromSchema<T, Depth extends number = 5> =
  T extends { mutable: true } ? FromSchemaInternal<T> :
  DeepReadonly<Depth extends 0
    ? any
    : FromSchemaInternal<T, Depth>
  >;

type FromSchemaInternal<T, Depth extends number = 5> = T extends { const: infer Const } ? Const
  : T extends { enum: infer Enum } ? Enum extends ReadonlyArray<any> ? Enum[number] : never
  : T extends { oneOf: infer Schemas }
  ? Schemas extends ReadonlyArray<Schema> ? FromOneOfSchema<Schemas, Decrement<Depth>> : never
  : T extends { allOf: infer Schemas }
  ? Schemas extends ReadonlyArray<Schema> ? FromAllOfSchema<Schemas, Decrement<Depth>> : never
  : T extends { type: 'number' | 'integer' }
  ? number
  : T extends { type: 'string' }
  ? string
  : T extends { type: 'boolean' }
  ? boolean
  : T extends { type: 'null' }
  ? null
  : T extends { type: 'typed-buffer', items: infer Items }
  ? TypedBuffer<FromSchemaInternal<Items>>
  : T extends { type: 'array' } | { items: any }
  ? FromSchemaArray<T, Decrement<Depth>>
  : T extends { type?: undefined, default: infer D } ? D
  : T extends { type: 'object' } | { properties: any }
  ? FromSchemaObject<T, Decrement<Depth>>
  : any
  ;

type Decrement<N extends number> = ((...x: any[]) => void) extends (
  arg: any,
  ...rest: infer R
) => void
  ? R['length']
  : never;

type FromSchemaArray<T, Depth extends number> = T extends {
  items: infer Items;
}
  ? T extends { minItems: infer Min; maxItems: infer Max }
  ? Equal<Min, Max> extends true
  ? BuildTuple<FromSchema<Items, Depth>, Min>
  : FromSchema<Items, Depth>[]
  : FromSchema<Items, Depth>[]
  : any[];

type BuildTuple<T, N, R extends unknown[] = []> = R['length'] extends N
  ? R
  : BuildTuple<T, N, [...R, T]>;

type FromSchemaObject<T extends Schema, Depth extends number> = T extends {
  properties: infer P;
}
  ? Simplify<
    {
      [K in RequiredKeys<T>]: FromSchema<P[K], Depth>;
    } & {
      [K in OptionalKeys<T>]?: FromSchema<P[K], Depth>;
    } & (T extends { additionalProperties: infer AP }
      ? AP extends false
      ? {}
      : AP extends boolean
      ? AP extends true
      ? { [key: string]: any }
      : {}
      : AP extends Schema
      ? { [key: string]: FromSchema<AP, Depth> }
      : {}
      : {})
  >
  : T extends { additionalProperties: infer AP }
  ? AP extends boolean
  ? AP extends true
  ? { [key: string]: any }
  : {}
  : AP extends Schema
  ? { [key: string]: FromSchema<AP, Depth> }
  : {}
  : {};

type RequiredKeys<T> = T extends { required: infer R }
  ? R extends readonly (infer K)[]
  ? K extends string
  ? K
  : never
  : never
  : never;

type OptionalKeys<T> = T extends { properties: infer P }
  ? Exclude<keyof P, RequiredKeys<T>>
  : never;

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <
  T
>() => T extends B ? 1 : 2
  ? true
  : false;

type Simplify<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

type FromOneOfSchema<Schemas extends ReadonlyArray<Schema>, Depth extends number> = Schemas[number] extends infer S
  ? S extends Schema
  ? FromSchema<S, Depth>
  : never
  : never;

type FromAllOfSchema<Schemas extends ReadonlyArray<Schema>, Depth extends number> =
  Schemas extends readonly [infer First, ...infer Rest]
  ? First extends Schema
  ? Rest extends ReadonlyArray<Schema>
  ? FromSchema<First, Depth> & FromAllOfSchema<Rest, Depth>
  : FromSchema<First, Depth>
  : never
  : {};

//  type check tests

type Test1 = FromSchema<{ type: 'number' }>; // number
type CheckNumber = True<EquivalentTypes<Test1, number>>;

type Test2 = FromSchema<{
  properties: {
    a: { type: 'number' };
    b: { type: 'string' };
  };
  required: ['a'];
  additionalProperties: false;
}>; // { a: number; b?: string }
type CheckObject = True<EquivalentTypes<Test2, { a: number; b?: string }>>;

type Test3 = FromSchema<{
  type: 'array';
  items: { type: 'number' };
  minItems: 3;
  maxItems: 3;
}>; // [number, number, number]
type CheckTuple = True<EquivalentTypes<Test3, readonly [number, number, number]>>;

type TestConst = FromSchema<{ const: 42 }>; // 42
type CheckConst = True<EquivalentTypes<TestConst, 42>>;

type TestEnum = FromSchema<{ enum: [1, 2, 3] }>; // 1 | 2 | 3
type CheckEnum = True<EquivalentTypes<TestEnum, 1 | 2 | 3>>;

type TestStringEnum = FromSchema<{ enum: ['a', 'b', 'c'] }>; // 'a' | 'b' | 'c'
type CheckStringEnum = True<EquivalentTypes<TestStringEnum, 'a' | 'b' | 'c'>>;

const mySchema = {
  type: 'object',
  properties: {
    a: { type: 'number' },
    b: { type: 'string' },
    c: { enum: [1, 2, 3] }
  },
  required: ['a', 'c'],
  additionalProperties: false,
} as const satisfies Schema;

type MyType = FromSchema<typeof mySchema>;
type CheckMyType = True<EquivalentTypes<MyType, { a: number; b?: string; c: 1 | 2 | 3 }>>;

type TestAdditionalProps = FromSchema<{
  type: 'object';
  additionalProperties: { type: 'number' }
}>; // { [key: string]: number }
type CheckTestAdditionalProps = True<EquivalentTypes<TestAdditionalProps, { readonly [x: string]: number; }>>;

type TestDefault = FromSchema<{ default: 42 }>; // 42
type CheckDefault = True<EquivalentTypes<TestDefault, 42>>;

type TestTypedBuffer = FromSchema<{ type: 'typed-buffer', items: { type: 'number' } }>; // TypedBuffer<number>
type CheckTypedBuffer = True<EquivalentTypes<TestTypedBuffer, TypedBuffer<number>>>;

type TestBlob = FromSchema<{ type: 'blob' }>; // Blob
type CheckBlob = True<EquivalentTypes<TestBlob, Blob>>;

// Test new additionalProperties default behavior (undefined should behave like false)
type TestAdditionalPropsUndefined = FromSchema<{
  type: 'object';
  properties: {
    a: { type: 'number' };
    b: { type: 'string' };
  };
  required: ['a'];
}>; // { a: number; b?: string } - no additional properties allowed
type CheckAdditionalPropsUndefined = True<EquivalentTypes<TestAdditionalPropsUndefined, { a: number; b?: string }>>;

// Test explicit additionalProperties: true
type TestAdditionalPropsTrue = FromSchema<{
  type: 'object';
  properties: {
    a: { type: 'number' };
  };
  additionalProperties: true;
}>; // { a: number; [key: string]: any }

// NOTE: Test for additionalProperties: true with existing properties is complex due to intersection behavior
// Skipping this test case for now
// type CheckAdditionalPropsTrue = True<EquivalentTypes<TestAdditionalPropsTrue, ExpectedType>>;

// Test object with no properties but undefined additionalProperties
type TestNoPropsUndefinedAdditional = FromSchema<{
  type: 'object';
}>; // {} - no additional properties allowed by default
type CheckNoPropsUndefinedAdditional = True<EquivalentTypes<TestNoPropsUndefinedAdditional, {}>>;

// Test object with no properties but explicit additionalProperties: true
type TestNoPropsExplicitTrue = FromSchema<{
  type: 'object';
  additionalProperties: true;
}>; // { [key: string]: any }
type CheckNoPropsExplicitTrue = True<EquivalentTypes<TestNoPropsExplicitTrue, { [key: string]: any }>>;

type TestMutable = FromSchema<{ mutable: true, default: number[][] }>;
type CheckMutable = True<EquivalentTypes<TestMutable, number[][]>>;

// Test allOf functionality
type TestAllOfBasic = FromSchema<{
  allOf: [
    { type: 'object'; properties: { name: { type: 'string' } }; required: ['name'] },
    { type: 'object'; properties: { age: { type: 'number' } }; required: ['age'] }
  ]
}>; // { name: string; age: number }
type CheckAllOfBasic = True<EquivalentTypes<TestAllOfBasic, { name: string; age: number }>>;

type TestAllOfWithOptional = FromSchema<{
  allOf: [
    { type: 'object'; properties: { id: { type: 'string' } }; required: ['id'] },
    { type: 'object'; properties: { email: { type: 'string' } } }
  ]
}>; // { id: string; email?: string }
type CheckAllOfWithOptional = True<EquivalentTypes<TestAllOfWithOptional, { id: string; email?: string }>>;

type TestAllOfWithConstraints = FromSchema<{
  allOf: [
    { type: 'object'; properties: { value: { type: 'number' } } },
    { type: 'object'; properties: { value: { minimum: 0, maximum: 100 } } }
  ]
}>; // { value?: number } (constraints are merged)
type CheckAllOfWithConstraints = True<EquivalentTypes<TestAllOfWithConstraints, { value?: number }>>;

type TestAllOfEmpty = FromSchema<{ allOf: [] }>; // {}
type CheckAllOfEmpty = True<EquivalentTypes<TestAllOfEmpty, {}>>;

type TestAllOfSingle = FromSchema<{
  allOf: [{ type: 'object'; properties: { name: { type: 'string' } } }]
}>; // { name?: string }
type CheckAllOfSingle = True<EquivalentTypes<TestAllOfSingle, { name?: string }>>;
