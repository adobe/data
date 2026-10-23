// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { IsStruct } from "./is-struct.js";
import type { Schema } from "./schema.js";

// Local copies of the standard compile-time assertion helpers.
type Equal<X, Y> =
    (<T>() => T extends X ? 1 : 2) extends
    (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

// primitives
check<Equal<Schema.ToType<{ type: 'string' }>, string>>();
check<Equal<Schema.ToType<{ type: 'number' }>, number>>();
check<Equal<Schema.ToType<{ type: 'integer' }>, number>>();
check<Equal<Schema.ToType<{ type: 'boolean' }>, boolean>>();
check<Equal<Schema.ToType<{ type: 'null' }>, null>>();

// const narrows
check<Equal<Schema.ToType<{ const: 'a' }>, 'a'>>();
check<Equal<Schema.ToType<{ const: true }>, true>>();

// standalone const accepts any JSON value
check<Equal<Schema.ToType<{ const: 'x' }>, 'x'>>();
check<Equal<Schema.ToType<{ const: readonly [1, 2] }>, readonly [1, 2]>>();
const okConst: Schema = { const: { a: [1, 'b', null, { c: true }] } };
// @ts-expect-error undefined is not a JSON value
const badConstUndefined: Schema = { const: undefined };
// @ts-expect-error functions are not JSON values
const badConstFn: Schema = { const: () => 1 };
// @ts-expect-error nested non-JSON values are rejected
const badConstNested: Schema = { type: 'object', properties: {}, const: { a: undefined } };
// @ts-expect-error `type` + `const` is redundant, not a valid Schema
const badTypeAndConst: Schema = { type: 'boolean', const: true };
// @ts-expect-error same when written `as const satisfies Schema`
const badSatisfies = { type: 'boolean', const: true } as const satisfies Schema;
void [badTypeAndConst, badSatisfies];
void [okConst, badConstUndefined, badConstFn, badConstNested];

// arrays
check<Equal<Schema.ToType<{ type: 'array'; items: { type: 'number' } }>, readonly number[]>>();

// objects: all required when `required` is absent
check<Equal<
    Schema.ToType<{ type: 'object'; properties: { a: { type: 'number' }; b: { type: 'string' } } }>,
    { readonly a: number; readonly b: string }
>>();
// objects: only listed keys required when `required` is present
check<Equal<
    Schema.ToType<{ type: 'object'; properties: { a: { type: 'number' }; b: { type: 'string' } }; required: ['a'] }>,
    { readonly a: number; readonly b?: string }
>>();

// combinators
check<Equal<Schema.ToType<{ anyOf: [{ type: 'string' }, { type: 'null' }] }>, string | null>>();
check<Equal<
    Schema.ToType<{ allOf: [
        { type: 'object'; properties: { a: { type: 'number' } } },
        { type: 'object'; properties: { b: { type: 'string' } } },
    ] }>,
    { readonly a: number } & { readonly b: string }
>>();

// ForType: accepts matching schemas, rejects mismatches
const okNumber: Schema.ForType<number> = { type: 'integer' };
const okNull: Schema.ForType<null> = { type: 'null' };
const okUnion: Schema.ForType<string | null> = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const okArray: Schema.ForType<readonly string[]> = { type: 'array', items: { type: 'string' } };
// @ts-expect-error string schema does not describe a number
const badNumber: Schema.ForType<number> = { type: 'string' };
// @ts-expect-error union members must describe a branch of the union
const badUnion: Schema.ForType<string | null> = { anyOf: [{ type: 'number' }] };
// @ts-expect-error array items must match
const badArray: Schema.ForType<readonly string[]> = { type: 'array', items: { type: 'number' } };
void [okNumber, okNull, okUnion, okArray, badNumber, badUnion, badArray];

// every schema form is writable-free, so `as const` literals satisfy Schema
const asConstObject = { type: 'object', properties: { a: { type: 'number' } }, required: ['a'] } as const satisfies Schema;
const asConstAnyOf = { anyOf: [{ type: 'string' }, { type: 'null' }] } as const satisfies Schema;
const asConstAllOf = { allOf: [{ type: 'object', properties: {} }, { const: 1 }] } as const satisfies Schema;
const asConstArray = { type: 'array', items: { const: [1, { a: null }] } } as const satisfies Schema;
check<Equal<Schema.ToType<typeof asConstObject>['a'], number>>();
check<Equal<Schema.ToType<typeof asConstAnyOf>, string | null>>();
void [asConstObject, asConstAnyOf, asConstAllOf, asConstArray];

// fields are readonly
declare const stringSchema: Extract<Schema, { type: 'string' }>;
// @ts-expect-error schemas are immutable
stringSchema.minLength = 1;
declare const objectSchema: Extract<Schema, { type: 'object' }>;
// @ts-expect-error properties are immutable
objectSchema.properties = {};
// @ts-expect-error required is a readonly array
objectSchema.required?.push('x');

// ForType<true> must not admit the redundant type + const form
// @ts-expect-error redundant
const badForTypeRedundant: Schema.ForType<true> = { type: 'boolean', const: true };
void badForTypeRedundant;

// ForType boolean literals: only the matching bare const schema
const okTrue: Schema.ForType<true> = { const: true };
const okFalse: Schema.ForType<false> = { const: false };
const okBoolean: Schema.ForType<boolean> = { type: 'boolean' };
// @ts-expect-error const false does not describe true
const badTrue: Schema.ForType<true> = { const: false };
// @ts-expect-error const true does not describe false
const badFalse: Schema.ForType<false> = { const: true };
// @ts-expect-error redundant type + const for false
const badFalseRedundant: Schema.ForType<false> = { type: 'boolean', const: false };
// @ts-expect-error a const schema is too narrow for plain boolean
const badBoolean: Schema.ForType<boolean> = { const: true };
// @ts-expect-error type without const is too wide for the literal
const badTrueWide: Schema.ForType<true> = { type: 'boolean' };
void [okTrue, okFalse, okBoolean, badTrue, badFalse, badFalseRedundant, badBoolean, badTrueWide];

// fixed-length arrays are tuples; any other length is an array
check<Equal<Schema.ToType<{ type: 'array'; items: { type: 'number' }; minItems: 3; maxItems: 3 }>, readonly [number, number, number]>>();
check<Equal<Schema.ToType<{ type: 'array'; items: { type: 'number' }; minItems: 2; maxItems: 3 }>, readonly number[]>>();
check<Equal<Schema.ToType<{ type: 'array'; items: { type: 'number' }; minItems: number; maxItems: number }>, readonly number[]>>();

// sets and maps, forms JSON lacks, are read-only
check<Equal<Schema.ToType<{ type: 'set'; items: { type: 'string' } }>, ReadonlySet<string>>>();
check<Equal<Schema.ToType<{ type: 'map'; keys: { type: 'string' }; values: { type: 'array'; items: { type: 'number' } } }>, ReadonlyMap<string, readonly number[]>>>();
check<Equal<Schema.ToType<{ type: 'object'; properties: { tags: { type: 'set'; items: { const: 'a' } } } }>, { readonly tags: ReadonlySet<'a'> }>>();
const okSet: Schema.ForType<ReadonlySet<number>> = { type: 'set', items: { type: 'integer' } };
const okMap: Schema.ForType<ReadonlyMap<string, boolean>> = { type: 'map', keys: { type: 'string' }, values: { type: 'boolean' } };
// @ts-expect-error a set's items must match
const badSet: Schema.ForType<ReadonlySet<number>> = { type: 'set', items: { type: 'string' } };
// @ts-expect-error a map's values must match
const badMap: Schema.ForType<ReadonlyMap<string, boolean>> = { type: 'map', keys: { type: 'string' }, values: { type: 'number' } };
// @ts-expect-error a set has items, not keys and values
const badSetForm: Schema = { type: 'set', keys: { type: 'string' }, values: { type: 'string' } };
// @ts-expect-error a map has keys and values
const badMapForm: Schema = { type: 'map', items: { type: 'string' } };
void [okSet, okMap, badSet, badMap, badSetForm, badMapForm];

// A set or map isn't a struct: neither lives in shared memory.
check<Equal<IsStruct<ReadonlySet<number>>, false>>();
check<Equal<IsStruct<ReadonlyMap<number, number>>, false>>();

// Schema.Type is the plain type a schema describes, so a type named by it is that type: a number or a tuple, unbranded.
type Level = Schema.Type<{ type: "integer"; minimum: 0; maximum: 9 }>;
check<Equal<Level, number>>();
check<Equal<Schema.Type<{ type: "array"; items: { type: "number"; precision: 1 }; minItems: 3; maxItems: 3 }>, readonly [number, number, number]>>();
// @ts-expect-error its argument is a schema
type NotSchema = Schema.Type<{ type: "integer"; minimum: "zero" }>;
