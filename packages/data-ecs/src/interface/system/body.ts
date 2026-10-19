import type { Component } from '../component/component.js';
import type { Entity } from '../entity/entity.js';
import type { Resource } from '../resource/resource.js';
import type { Holding } from '../resource/condition.js';
import type { Schema } from '../schema/schema.js';
import type { Commands } from './commands.js';
import type { Declaration } from './declaration.js';
import type { Listed, Property } from './property.js';
import type { RenderContext } from './render.js';
import type { ComponentValues, LookupFunction, ResourceValues, Values } from './values.js';

/** `read` values are read-only, `write` values readable and writable. */
export type Row<D extends Declaration> =
    { readonly entity: Entity }
    & Values<Listed<Property<D, "components">, "read">, Listed<Property<D, "components">, "write">, Component.Key, ComponentValues>;

type Resources<D> = Listed<Property<D, "resources">, "read"> | Listed<Property<D, "resources">, "write"> | Is<D>;
type Is<D> = Listed<Property<D, "resources">, "is">;
type Reduced<D> = keyof Property<D, "reduce"> & Resource.Key;

/**
 * What a body uses besides its row, by kind, under the declaration's own keys: each is present only when the
 * declaration declares something of its kind. `commands` is there for every system but a GPU kernel, a render system
 * and a synced system.
 */
export type Context<D extends Declaration> =
    ([Resources<D>] extends [never] ? {} : {
        readonly resources: Values<Listed<Property<D, "resources">, "read">, Listed<Property<D, "resources">, "write">, Resource.Key, ResourceValues>
            & { readonly [K in Is<D> & Resource.Key]: Holding<K> };
    })
    & ([keyof Property<D, "lookup">] extends [never] ? {} : {
        readonly lookup: { readonly [K in keyof Property<D, "lookup">]: LookupFunction<Property<D, "lookup">[K]> };
    })
    & ([Reduced<D>] extends [never] ? {} : {
        /** Each resource it reduces into, as a function contributing a value to the run's fold. */
        readonly reduce: { readonly [K in Reduced<D>]: (value: Resource.Value<K>) => void };
    })
    & (Property<D, "input"> extends Schema ? { readonly input: Schema.ToType<Property<D, "input">> } : {})
    & (Property<D, "up"> extends object ? {
        /** The parent's `up.read` values, or null for a row without a parent. */
        readonly up: { readonly [K in Listed<Property<D, "up">, "read"> & Component.Key]: Component.Value<K> } | null;
    } : {})
    & (D extends { readonly kernel: "gpu" } | { readonly shader: object } | { readonly synced: true } ? {} : { readonly commands: Commands });

/** `(row, context)` for a system with `components`, `(context)` for one without, and `(gpu, context)` for a render system. */
export type Body<D extends Declaration> =
    D extends { readonly shader: object } ? (gpu: RenderContext, context: Context<D>) => void :
    Property<D, "components"> extends undefined ? (context: Context<D>) => void :
    (row: Row<D>, context: Context<D>) => void;
