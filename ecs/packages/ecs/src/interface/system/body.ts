// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from '../component/component.js';
import type { Writable } from '../component/value.js';
import type { Entity } from '../entity/entity.js';
import type { Resource } from '../resource/resource.js';
import type { Holding } from '../resource/condition.js';
import type { Reduced } from '../resource/reduction.js';
import type { WorldWritten } from '../resource/written.js';
import type { Commands } from './commands.js';
import type { Declaration } from './declaration.js';
import type { Listed, Property } from './property.js';
import type { RenderContext } from './render.js';
import type { ComponentValues, LookupFunction, ResourceValues, Values } from './values.js';

/** The components every entity a declaration matches has: those in `with`, `added` and `changed`. */
export type Members<D> =
    | Listed<Property<D, "components">, "with"> | Listed<Property<D, "components">, "added"> | Listed<Property<D, "components">, "changed">;

/** Whether a declaration only reads: an observer or a render system. */
type Reading<D> = D extends { readonly observer: true } | { readonly shader: object } ? true : false;

/** The components a declaration's rows hold only where an entity has them. */
export type Optional<D> = Exclude<Listed<Property<D, "components">, "optional">, Members<D>>;

/** Each optional component's value or `undefined`, as `ComponentValues` gives members'. */
type OptionalValues = { readonly [K in Component.Key]: Component<K> | undefined };

/**
 * Its members' values, writable but for references and shared components, and in a system that only reads; its
 * optional components' too, or `undefined` where an entity lacks one, which assigning to fails the system. A shared
 * component reads as its archetype's value, which only `commands.add` changes, by moving the entity.
 */
export type Row<D extends Declaration> =
    { readonly entity: Entity }
    & Values<Members<D>, Reading<D> extends true ? never : Members<D> & Writable, Component.Key, ComponentValues>
    & Values<Optional<D>, Reading<D> extends true ? never : Optional<D> & Writable, Component.Key, OptionalValues>;

/** Resources systems write: every one but those reduced, which only their contributors' fold sets, and those only the world writes. */
type Writes = Exclude<Resource.Key, Reduced | WorldWritten>;

/** Every resource, read-only. */
export type ReadResources = Values<Resource.Key, never, Resource.Key, ResourceValues>;

/** Every resource, writable as `Writes` says. */
export type WriteResources = Values<Resource.Key, Writes, Resource.Key, ResourceValues>;

/** Each reduced resource, as a function contributing a value to the run's fold. */
type Reductions = { readonly [K in Reduced]: (value: Resource<K>) => void };

type Is<D> = Listed<Property<D, "resources">, "is">;

/**
 * What a body uses besides its row: every resource, its lookups by name, the resources it may reduce into, its
 * parent's values with `up`, and its commands, there for every system but a GPU kernel, a render system and an
 * observer system. The build infers which of them the body reads and writes.
 */
export type Context<D extends Declaration> =
    {
        readonly resources: (Reading<D> extends true ? ReadResources : WriteResources) & { readonly [K in Is<D> & Resource.Key]: Holding<K> };
    }
    & ([keyof Property<D, "lookup">] extends [never] ? {} : {
        readonly lookup: { readonly [K in keyof Property<D, "lookup">]: LookupFunction<Property<D, "lookup">[K]> };
    })
    & (Reading<D> extends true ? {} : { readonly reduce: Reductions })
    & (Property<D, "up"> extends object ? {
        /** The parent's values the body reads, or null for a row without a parent or whose parent lacks one of them. */
        readonly up: ComponentValues | null;
    } : {})
    & (D extends { readonly kernel: "gpu" } | { readonly shader: object } | { readonly observer: true } ? {} : { readonly commands: Commands });

/**
 * `(row, context, input)` for a system with `components`, `(context, input)` for one without, and `(gpu, context)` for
 * a render system. `input` is the value each run passes, of the type the body gives its parameter; a body without one
 * takes none.
 */
export type Body<D extends Declaration, I = undefined> =
    D extends { readonly shader: object } ? (gpu: RenderContext, context: Context<D>) => void :
    D extends { readonly components: object } ? (row: Row<D>, context: Context<D>, input: I) => void :
    (context: Context<D>, input: I) => void;
