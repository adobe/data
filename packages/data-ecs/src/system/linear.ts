import type { Component } from '../component/component.js';
import type { Resource } from '../resource/resource.js';

/** Numbers, booleans, fixed-length tuples and structs of those: values that live in linear memory. */
export type IsLinear<T> =
    [T] extends [number | boolean] ? true :
    [T] extends [readonly unknown[]] ? (number extends T["length"] ? false : IsLinear<T[number]>) :
    [T] extends [object] ? (false extends { [K in keyof T]-?: IsLinear<T[K]> }[keyof T] ? false : true) :
    false;

export type LinearComponent = { [K in Component.Name]: IsLinear<Component.Value<K>> extends true ? K : never }[Component.Name];

export type LinearResource = { [K in Resource.Name]: IsLinear<Resource.Value<K>> extends true ? K : never }[Resource.Name];
