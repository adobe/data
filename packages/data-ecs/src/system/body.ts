import type { Component } from '../component/component.js';
import type { Entity } from '../entity/entity.js';
import type { Resource } from '../resource/resource.js';
import type { Schema } from '../schema/schema.js';
import type { Commands } from './commands.js';
import type { Declaration } from './declaration.js';
import type { Listed, Property } from './property.js';
import type { ComponentValues, LookupFunction, ResourceValues, Values } from './values.js';

/** `read` values are read-only, `write` values are writable. `undefined` for a system without a query. */
export type Row<D extends Declaration> =
    Property<D, "query"> extends undefined ? undefined :
    { readonly entity: Entity }
    & Values<Listed<Property<D, "query">, "read">, Listed<Property<D, "query">, "write">, Component.Name, ComponentValues>;

/** Each resource a system reduces, as a function contributing a value to its fold. */
type Reducers<R> = { readonly [K in keyof R & Resource.Name]: (value: Resource.Value<K>) => void };

/** Lookups, resources and `args`, flattened into one object. */
export type Context<D extends Declaration> =
    { readonly [K in keyof Property<D, "lookup">]: LookupFunction<Property<D, "lookup">[K]> }
    & Values<Listed<Property<D, "resources">, "read">, Listed<Property<D, "resources">, "write">, Resource.Name, ResourceValues>
    & Reducers<Property<Property<D, "resources">, "reduce">>
    & (Property<D, "args"> extends Schema ? { readonly args: Schema.ToType<Property<D, "args">> } : {});

export type Body<D extends Declaration> = (row: Row<D>, context: Context<D>, commands: Commands) => void;

