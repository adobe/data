// © 2026 Adobe. MIT License. See /LICENSE for details.

import { TypedBuffer } from "../typed-buffer/typed-buffer.js";
import { DeepReadonly, EquivalentTypes, False, True } from "../types/types.js";
import type { Observe } from "../observe/index.js";
import { Schema } from "./schema.js";

export type ToType<T, Depth extends number = 5> =
  T extends false ? void :
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
  : T extends { type: 'blob' }
  ? Blob
  : T extends { type: 'typed-buffer', items: infer Items }
  ? TypedBuffer<FromSchemaInternal<Items>>
  : T extends { type: 'typed-buffer' }
  ? TypedBuffer<unknown>
  : T extends { type: 'array' } | { items: any }
  ? FromSchemaArray<T, Decrement<Depth>>
  : T extends { type?: undefined, default: infer D } ? D
  : T extends { type: 'object' } | { properties: any }
  ? FromSchemaObject<T, Decrement<Depth>>
  // Type-constructor schemas are placed AFTER the data branches on purpose: a
  // data schema (every ECS component/resource) must NOT pay extra conditional
  // depth for these, because `FromSchemas` runs `ToType` per component across a
  // whole plugin `combine` chain, and the added depth tips deep chains past TS's
  // stack-depth limit (TS2321). Only observe/promise/generator/function schemas —
  // which appear in service schemas, never in the Plugin hot path — fall through.
  : T extends { type: 'observe' }
  ? Observe<ToType<ValueSchema<T>, Decrement<Depth>>>
  : T extends { type: 'promise' }
  ? Promise<ToType<ValueSchema<T>, Decrement<Depth>>>
  : T extends { type: 'generator' }
  ? AsyncGenerator<ToType<ValueSchema<T>, Decrement<Depth>>>
  : T extends { type: 'function' }
  ? FromSchemaFunction<T, Decrement<Depth>>
  : any
  ;

type Decrement<N extends number> = ((...x: any[]) => void) extends (
  arg: any,
  ...rest: infer R
) => void
  ? R['length']
  : never;

// The wrapped value schema for observe/promise/generator; absent ⇒ any.
type ValueSchema<T> = T extends { value: infer V } ? V : {};

// The function-constructor mapping: `signature.parameters` → positional args,
// `signature.returns` → result. Absent `signature` ⇒ `() => void`.
type FromSchemaFunction<T, Depth extends number> =
  T extends { signature: infer Sig }
  ? (...args: FromSchemaArgs<SignatureParams<Sig>, Depth>) => FromSchemaReturns<Sig, Depth>
  : () => void;

// The signature's parameters tuple; absent ⇒ no args.
type SignatureParams<Sig> =
  Sig extends { parameters: infer P } ? P extends readonly Schema[] ? P : readonly [] : readonly [];

type FromSchemaArgs<P extends readonly Schema[], Depth extends number> = {
  -readonly [K in keyof P]: ToType<P[K], Depth>;
};

// Absent `returns` ⇒ void (a function that returns nothing meaningful).
type FromSchemaReturns<Sig, Depth extends number> =
  Sig extends { returns: infer R } ? R extends Schema ? ToType<R, Depth> : void : void;

type FromSchemaArray<T, Depth extends number> = T extends {
  items: infer Items;
}
  ? T extends { minItems: infer Min; maxItems: infer Max }
  ? Equal<Min, Max> extends true
  ? BuildTuple<ToType<Items, Depth>, Min>
  : ToType<Items, Depth>[]
  : ToType<Items, Depth>[]
  : any[];

type BuildTuple<T, N, R extends unknown[] = []> = R['length'] extends N
  ? R
  : BuildTuple<T, N, [...R, T]>;

type FromSchemaObject<T extends Schema, Depth extends number> = T extends {
  properties: infer P;
}
  ? Simplify<
    {
      [K in RequiredKeys<T>]: ToType<P[K], Depth>;
    } & {
      [K in OptionalKeys<T>]?: ToType<P[K], Depth>;
    } & (T extends { additionalProperties: infer AP }
      ? AP extends false
      ? {}
      : AP extends boolean
      ? AP extends true
      ? { [key: string]: any }
      : {}
      : AP extends Schema
      ? { [key: string]: ToType<AP, Depth> }
      : {}
      : {})
  >
  : T extends { additionalProperties: infer AP }
  ? AP extends boolean
  ? AP extends true
  ? { [key: string]: any }
  : {}
  : AP extends Schema
  ? { [key: string]: ToType<AP, Depth> }
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
  ? ToType<S, Depth>
  : never
  : never;

type FromAllOfSchema<Schemas extends ReadonlyArray<Schema>, Depth extends number> =
  Schemas extends readonly [infer First, ...infer Rest]
  ? First extends Schema
  ? Rest extends ReadonlyArray<Schema>
  ? ToType<First, Depth> & FromAllOfSchema<Rest, Depth>
  : ToType<First, Depth>
  : never
  : {};

//  type check tests

type TestFalse = ToType<false>; // void
type CheckFalse = True<EquivalentTypes<TestFalse, void>>;

type Test1 = ToType<{ type: 'number' }>; // number
type CheckNumber = True<EquivalentTypes<Test1, number>>;

type Test2 = ToType<{
  properties: {
    a: { type: 'number' };
    b: { type: 'string' };
  };
  required: ['a'];
  additionalProperties: false;
}>; // { a: number; b?: string }
type CheckObject = True<EquivalentTypes<Test2, { a: number; b?: string }>>;

type Test3 = ToType<{
  type: 'array';
  items: { type: 'number' };
  minItems: 3;
  maxItems: 3;
}>; // [number, number, number]
type CheckTuple = True<EquivalentTypes<Test3, readonly [number, number, number]>>;

type TestConst = ToType<{ const: 42 }>; // 42
type CheckConst = True<EquivalentTypes<TestConst, 42>>;

type TestEnum = ToType<{ enum: [1, 2, 3] }>; // 1 | 2 | 3
type CheckEnum = True<EquivalentTypes<TestEnum, 1 | 2 | 3>>;

type TestStringEnum = ToType<{ enum: ['a', 'b', 'c'] }>; // 'a' | 'b' | 'c'
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

type MyType = ToType<typeof mySchema>;
type CheckMyType = True<EquivalentTypes<MyType, { a: number; b?: string; c: 1 | 2 | 3 }>>;

type TestAdditionalProps = ToType<{
  type: 'object';
  additionalProperties: { type: 'number' }
}>; // { [key: string]: number }
type CheckTestAdditionalProps = True<EquivalentTypes<TestAdditionalProps, { readonly [x: string]: number; }>>;

type TestDefault = ToType<{ default: 42 }>; // 42
type CheckDefault = True<EquivalentTypes<TestDefault, 42>>;

type TestTypedBuffer = ToType<{ type: 'typed-buffer', items: { type: 'number' } }>; // TypedBuffer<number>
type CheckTypedBuffer = True<EquivalentTypes<TestTypedBuffer, TypedBuffer<number>>>;

type TestTypedBufferNoItems = ToType<{ type: 'typed-buffer' }>; // TypedBuffer<unknown>
type CheckTypedBufferNoItems = True<EquivalentTypes<TestTypedBufferNoItems, TypedBuffer<unknown>>>;

type TestBlob = ToType<{ type: 'blob' }>; // Blob
type CheckBlob = True<EquivalentTypes<TestBlob, Blob>>;

// Test new additionalProperties default behavior (undefined should behave like false)
type TestAdditionalPropsUndefined = ToType<{
  type: 'object';
  properties: {
    a: { type: 'number' };
    b: { type: 'string' };
  };
  required: ['a'];
}>; // { a: number; b?: string } - no additional properties allowed
type CheckAdditionalPropsUndefined = True<EquivalentTypes<TestAdditionalPropsUndefined, { a: number; b?: string }>>;

// Test explicit additionalProperties: true
type TestAdditionalPropsTrue = ToType<{
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
type TestNoPropsUndefinedAdditional = ToType<{
  type: 'object';
}>; // {} - no additional properties allowed by default
type CheckNoPropsUndefinedAdditional = True<EquivalentTypes<TestNoPropsUndefinedAdditional, {}>>;

// Test object with no properties but explicit additionalProperties: true
type TestNoPropsExplicitTrue = ToType<{
  type: 'object';
  additionalProperties: true;
}>; // { [key: string]: any }
type CheckNoPropsExplicitTrue = True<EquivalentTypes<TestNoPropsExplicitTrue, { [key: string]: any }>>;

type TestMutable = ToType<{ mutable: true, default: number[][] }>;
type CheckMutable = True<EquivalentTypes<TestMutable, number[][]>>;

// Test allOf functionality
type TestAllOfBasic = ToType<{
  allOf: [
    { type: 'object'; properties: { name: { type: 'string' } }; required: ['name'] },
    { type: 'object'; properties: { age: { type: 'number' } }; required: ['age'] }
  ]
}>; // { name: string; age: number }
type CheckAllOfBasic = True<EquivalentTypes<TestAllOfBasic, { name: string; age: number }>>;

type TestAllOfWithOptional = ToType<{
  allOf: [
    { type: 'object'; properties: { id: { type: 'string' } }; required: ['id'] },
    { type: 'object'; properties: { email: { type: 'string' } } }
  ]
}>; // { id: string; email?: string }
type CheckAllOfWithOptional = True<EquivalentTypes<TestAllOfWithOptional, { id: string; email?: string }>>;

type TestAllOfWithConstraints = ToType<{
  allOf: [
    { type: 'object'; properties: { value: { type: 'number' } } },
    { type: 'object'; properties: { value: { minimum: 0, maximum: 100 } } }
  ]
}>; // { value?: number } (constraints are merged)
type CheckAllOfWithConstraints = True<EquivalentTypes<TestAllOfWithConstraints, { value?: number }>>;

type TestAllOfEmpty = ToType<{ allOf: [] }>; // {}
type CheckAllOfEmpty = True<EquivalentTypes<TestAllOfEmpty, {}>>;

type TestAllOfSingle = ToType<{
  allOf: [{ type: 'object'; properties: { name: { type: 'string' } } }]
}>; // { name?: string }
type CheckAllOfSingle = True<EquivalentTypes<TestAllOfSingle, { name?: string }>>;

// ============================================================================
// TYPE-CONSTRUCTOR SCHEMAS (data-adjacent types)
// ============================================================================

// observe
type TestObserve = ToType<{ type: 'observe', value: { type: 'number' } }>; // Observe<number>
type CheckObserve = True<EquivalentTypes<TestObserve, Observe<number>>>;

type TestObserveNoValue = ToType<{ type: 'observe' }>; // Observe<any>
type CheckObserveNoValue = True<EquivalentTypes<TestObserveNoValue, Observe<any>>>;

type TestObserveObject = ToType<{
  type: 'observe',
  value: { type: 'object', properties: { x: { type: 'number' } }, required: ['x'], additionalProperties: false }
}>; // Observe<{ readonly x: number }>
type CheckObserveObject = True<EquivalentTypes<TestObserveObject, Observe<{ readonly x: number }>>>;

// promise
type TestPromise = ToType<{ type: 'promise', value: { type: 'string' } }>; // Promise<string>
type CheckPromise = True<EquivalentTypes<TestPromise, Promise<string>>>;

// generator
type TestGenerator = ToType<{ type: 'generator', value: { type: 'boolean' } }>; // AsyncGenerator<boolean>
type CheckGenerator = True<EquivalentTypes<TestGenerator, AsyncGenerator<boolean>>>;

// function
type TestFunction = ToType<{
  type: 'function', signature: { parameters: [{ type: 'number' }, { type: 'string' }], returns: { type: 'boolean' } }
}>; // (a: number, b: string) => boolean
type CheckFunction = True<EquivalentTypes<TestFunction, (a: number, b: string) => boolean>>;

type TestFunctionVoid = ToType<{ type: 'function', signature: { parameters: [] } }>; // () => void
type CheckFunctionVoid = True<EquivalentTypes<TestFunctionVoid, () => void>>;

type TestFunctionNoParams = ToType<{ type: 'function' }>; // () => void (no signature)
type CheckFunctionNoParams = True<EquivalentTypes<TestFunctionNoParams, () => void>>;

// `external` invocation-policy metadata never affects the derived function type.
type TestFunctionExternalIgnored = ToType<{
  type: 'function', signature: {
    parameters: [{ type: 'number' }], returns: { type: 'promise', value: { type: 'number' } },
    external: { link: true, agent: false }
  }
}>; // (a: number) => Promise<number>
type CheckFunctionExternalIgnored = True<EquivalentTypes<TestFunctionExternalIgnored, (a: number) => Promise<number>>>;

// Driver case: an AsyncGenerator<Data> parameter nested inside an object argument,
// with a Promise return — the shape plain-Data parameters could not express.
type TestStreamingAction = ToType<{
  type: 'function',
  signature: {
    parameters: [{
      type: 'object',
      properties: { chunks: { type: 'generator', value: { type: 'number' } } },
      required: ['chunks'],
      additionalProperties: false
    }],
    returns: { type: 'promise', value: { type: 'null' } }
  }
}>; // (arg: { readonly chunks: AsyncGenerator<number> }) => Promise<null>
type CheckStreamingAction = True<EquivalentTypes<
  TestStreamingAction,
  (arg: { readonly chunks: AsyncGenerator<number> }) => Promise<null>
>>;

// Negatives — inner types, constructor kinds, and function signatures are honored.
type CheckObserveNotString = False<EquivalentTypes<TestObserve, Observe<string>>>;
type CheckObserveNotPromise = False<EquivalentTypes<TestObserve, Promise<number>>>;
type CheckPromiseNotObserve = False<EquivalentTypes<TestPromise, Observe<string>>>;
type CheckGeneratorNotPromise = False<EquivalentTypes<TestGenerator, Promise<boolean>>>;
type CheckFunctionWrongArg = False<EquivalentTypes<TestFunction, (a: string, b: string) => boolean>>;
type CheckFunctionWrongReturn = False<EquivalentTypes<TestFunction, (a: number, b: string) => number>>;
type CheckFunctionWrongArity = False<EquivalentTypes<TestFunction, (a: number) => boolean>>;

