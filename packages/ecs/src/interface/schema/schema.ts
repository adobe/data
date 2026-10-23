// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from '../entity/entity.js';

/** Any value representable in JSON. */
type JSONValue = string | number | boolean | null | readonly JSONValue[] | { readonly [key: string]: JSONValue };

/**
 * How a linear value is laid out in memory, and a promise that it's GPU compatible: registration throws if it isn't.
 * - `storage`: WGSL storage-buffer layout, so a shader's matching `array<T>` reads the column directly.
 * - `vertex`: tightly packed, as WebGPU vertex buffers expect.
 * Without it, the value is packed tightly for the CPU and may use any linear type.
 */
type GpuLayout = 'storage' | 'vertex';

interface ObjectSchema<K extends string = string> {
    readonly type: 'object',
    readonly properties: { readonly [P in K]: Schema };
    readonly required?: readonly K[];
    readonly layout?: GpuLayout;
}

interface StringSchema {
    readonly type: 'string';
    readonly minLength?: number;
    readonly maxLength?: number;
}

interface ArraySchema<T extends Schema> {
    readonly type: 'array';
    readonly items: T;
    readonly layout?: GpuLayout;
    readonly minItems?: number;
    readonly maxItems?: number;
}

interface NumberSchema {
    readonly type: 'number';
    readonly minimum?: number;
    readonly maximum?: number;
    readonly precision?: 1 | 2;
}

/** An entity reference, typed `Entity`. Every entity-typed value uses it, so references can be found by schema. */
interface EntitySchema {
    readonly type: 'integer';
    readonly format: 'entity';
}

interface IntegerSchema {
    readonly type: 'integer';
    readonly format?: never;
    readonly minimum?: number;
    readonly maximum?: number;
}

interface BooleanSchema {
    readonly type: 'boolean';
}

interface NullSchema {
    readonly type: 'null';
}

/** A `ReadonlySet` of `items`' values. JSON has no set, so `'set'` isn't a JSON Schema type. */
interface SetSchema<T extends Schema> {
    readonly type: 'set';
    readonly items: T;
}

/** A `ReadonlyMap` from `keys`' values to `values`' values. JSON has no map, so `'map'` isn't a JSON Schema type. */
interface MapSchema<K extends Schema, V extends Schema> {
    readonly type: 'map';
    readonly keys: K;
    readonly values: V;
}

/** Matches exactly one JSON value of any shape. */
interface ConstSchema {
    /** The value alone fully describes the schema; combining it with `type` is redundant and disallowed. */
    readonly type?: never;
    readonly const: JSONValue;
}

interface AndSchema {
    readonly allOf: readonly Schema[];
}

interface OrSchema {
    readonly anyOf: readonly Schema[];
}

/**
 * A JSON Schema of the forms the ECS reads, and two forms JSON lacks: `{ type: 'set', items }` and
 * `{ type: 'map', keys, values }`.
 */
export type Schema = EntitySchema | ObjectSchema | StringSchema | ArraySchema<Schema> | NumberSchema | IntegerSchema | BooleanSchema | NullSchema | SetSchema<Schema> | MapSchema<Schema, Schema> | ConstSchema | AndSchema | OrSchema;

type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;

export namespace Schema {
    /** Object properties are all required unless `required` is present, then only those listed are. */
    type ObjectToType<T extends ObjectSchema> =
        T extends { required: readonly (infer R)[] }
            ? Flat<{ readonly [P in Extract<R, keyof T['properties']>]: Schema.ToType<T['properties'][P]> }
              & { readonly [P in Exclude<keyof T['properties'], R>]?: Schema.ToType<T['properties'][P]> }>
            : { readonly [P in keyof T['properties']]: Schema.ToType<T['properties'][P]> };

    /**
     * One object type with the properties of an intersection, each as optional and read-only as it was. It's a
     * conditional, so the result is an anonymous object type, which declarations emitted elsewhere can name.
     */
    type Flat<T> = T extends unknown ? { [P in keyof T]: T[P] } : never;

    /** An array whose `minItems` and `maxItems` are one literal length is a tuple of that length. */
    type ArrayToType<T, E> =
        T extends { readonly minItems: infer N extends number; readonly maxItems: infer M extends number }
            ? number extends N ? readonly E[] : [N] extends [M] ? [M] extends [N] ? Tuple<N, E> : readonly E[] : readonly E[]
            : readonly E[];

    type Tuple<N extends number, E, R extends readonly unknown[] = readonly []> =
        R["length"] extends N ? R : Tuple<N, E, readonly [...R, E]>;

    /**
     * A literal `const` narrows the type, a fixed-length array is a tuple, and a set or map is a `ReadonlySet` or
     * `ReadonlyMap`; otherwise the structural type is used.
     */
    export type ToType<T extends Schema> =
        T extends AndSchema ? UnionToIntersection<Schema.ToType<T['allOf'][number]>> :
        T extends OrSchema ? Schema.ToType<T['anyOf'][number]> :
        T extends { const: infer C } ? C :
        T extends EntitySchema ? Entity :
        T extends ObjectSchema ? ObjectToType<T> :
        T extends StringSchema ? string :
        T extends ArraySchema<infer U> ? ArrayToType<T, Schema.ToType<U>> :
        T extends SetSchema<infer U> ? ReadonlySet<Schema.ToType<U>> :
        T extends MapSchema<infer K, infer V> ? ReadonlyMap<Schema.ToType<K>, Schema.ToType<V>> :
        T extends NumberSchema ? number :
        T extends IntegerSchema ? number :
        T extends BooleanSchema ? boolean :
        T extends NullSchema ? null :
        never;

    /**
     * The type schema `S` describes, as a plain type: `type Level = Schema.Type<{ type: "integer"; minimum: 0; maximum: 9 }>`
     * is a `number`. Declarations naming such a type, directly or through aliases, get `S` as their schema from the
     * build, so a named type carries its precision, width and bounds.
     */
    export type Type<S extends Schema> = ToType<S>;

    /** The schemas whose `ToType` is `T`; constrains a schema to describe a known type. */
    export type ForType<T> = Schema &
    (
        [T] extends [boolean] ? ForNonUnion<T> :
        // A union of strings, such as an augmentable set of names, may also be described as any string.
        IsUnion<T> extends true ? (OrSchema & { anyOf: readonly ForTypeEach<T>[] }) | ([T] extends [string] ? StringSchema : never) :
        ForNonUnion<T>
    );

    type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never;
    type ForTypeEach<T> = T extends unknown ? ForType<T> : never;

    type ForNonUnion<T> =
        [T] extends [null] ? NullSchema :
        [T] extends [true] ? ConstSchema & { const: T } :
        [T] extends [false] ? ConstSchema & { const: T } :
        [T] extends [boolean] ? BooleanSchema :
        [T] extends [Entity] ? EntitySchema :
        [T] extends [string] ? (string extends T ? StringSchema : ConstSchema & { const: T }) :
        [T] extends [number] ? (NumberSchema | IntegerSchema) :
        T extends readonly (infer U)[] ? ArraySchema<ForType<U> & Schema> :
        T extends ReadonlyMap<infer K, infer V> ? MapSchema<ForType<K> & Schema, ForType<V> & Schema> :
        T extends ReadonlySet<infer U> ? SetSchema<ForType<U> & Schema> :
        // An optional property's schema describes its value when present.
        T extends object ? ObjectSchema<Extract<keyof T, string>> & { properties: { [P in keyof T]-?: ForType<Exclude<T[P], undefined>> } } :
        never;
}
