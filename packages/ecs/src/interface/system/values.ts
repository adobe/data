// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from '../component/component.js';
import type { Entity } from '../entity/entity.js';
import type { Index } from '../indexes/index-type.js';
import type { Resource } from '../resource/resource.js';
import type { Comparison } from '../world/filter.js';
import type { Listed, Property } from './property.js';

export type ComponentValues = { readonly [K in Component.Key]: Component.Value<K> };
export type ResourceValues = { readonly [K in Resource.Key]: Resource.Value<K> };

/** `Read` values are read-only, `Write` values writable. */
export type Values<Read, Write, Keys extends PropertyKey, Types> =
    { readonly [K in Exclude<Read, Write> & Keys]: Types[K & keyof Types] }
    & { -readonly [K in Write & Keys]: Types[K & keyof Types] };

/** An index declaration's key. */
export type KeyOf<D> = D extends { readonly key: infer K extends readonly Component.Key[] } ? K : readonly Component.Key[];

/** The components every entity an index holds has: its key parts and its `with`. */
export type HeldBy<D> = KeyOf<D>[number] | Listed<Property<D, "components">, "with">;

/** The key's values, in key order. */
type KeyValues<K extends readonly Component.Key[]> = { readonly [I in keyof K]: Component.Value<K[I] & Component.Key> };

/** A prefix of the key, possibly empty, whose last part may be a comparison. */
type Prefix<V extends readonly unknown[]> = V extends readonly [infer First, ...infer Rest]
    ? readonly [] | readonly [First | Comparison<First>] | readonly [First, ...Prefix<Rest>]
    : readonly [];

/** A row an index lookup gives: its entity and the values of what every entity the index holds has, read-only. */
type IndexRow<D> = { readonly entity: Entity } & { readonly [K in HeldBy<D> & Component.Key]: Component.Value<K> };

/**
 * The rows a lookup found, in the index's order: by entity for a hash index, by key and then entity for a sorted one.
 * Valid until its call site runs again, and each row until the list is.
 */
type Rows<R> = {
    readonly length: number;
    /**
     * Whether, since its system last ran, an entity entered or left it or moved within it, or a component in the
     * lookup's `changed` may have changed in one of its rows: conservative, as `changed` filters are, and true on a
     * system's first run and in finalizers.
     */
    readonly changed: boolean;
    /** The row at `index`, from 0 to `length - 1`. */
    at(index: number): R;
};

/** A lookup through an index, by its declaration `D`: by key, a prefix of it for a sorted index. */
type IndexLookup<D> =
    D extends { readonly unique: true }
        ? D extends { readonly sorted: true }
            ? ((...key: KeyValues<KeyOf<D>>) => IndexRow<D> | null) & ((...key: Prefix<KeyValues<KeyOf<D>>>) => Rows<IndexRow<D>>)
            : (...key: KeyValues<KeyOf<D>>) => IndexRow<D> | null
        : D extends { readonly sorted: true }
            ? (...key: Prefix<KeyValues<KeyOf<D>>>) => Rows<IndexRow<D>>
            : (...key: KeyValues<KeyOf<D>>) => Rows<IndexRow<D>>;

/**
 * The row a lookup by entity gives: the values of its `with`, read-only, and with `changed` declared, whether a
 * component it names may have changed in the entity since its system last ran: conservative, as `changed` filters are,
 * and true on a system's first run and in finalizers. With `changed`, valid until the lookup is called again.
 */
type EntityRow<L> = {
    readonly [K in (Listed<L, "with"> & Component.Key) | (L extends { readonly changed: readonly Component.Key[] } ? "changed" : never)]: K extends Component.Key ? Component.Value<K> : boolean
};

export type LookupFunction<L> = L extends { readonly index: Index<infer D> }
    ? IndexLookup<D>
    : (entity: Entity) => EntityRow<L> | null;
