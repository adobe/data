import type { Component } from '../component/component.js';
import type { Entity } from '../entity/entity.js';
import type { Resource } from '../resource/resource.js';
import type { Listed } from './property.js';

export type ComponentValues = { readonly [K in Component.Key]: Component.Value<K> };
export type ResourceValues = { readonly [K in Resource.Key]: Resource.Value<K> };

/** `Read` values are read-only, `Write` values writable. */
export type Values<Read, Write, Keys extends PropertyKey, Types> =
    { readonly [K in Exclude<Read, Write> & Keys]: Types[K & keyof Types] }
    & { -readonly [K in Write & Keys]: Types[K & keyof Types] };

export type LookupFunction<L> = (entity: Entity) => { readonly [K in Listed<L, "read"> & Component.Key]: Component.Value<K> } | null;
