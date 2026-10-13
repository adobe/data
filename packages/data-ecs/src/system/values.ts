import type { Component } from '../component/component.js';
import type { Entity } from '../entity/entity.js';
import type { Resource } from '../resource/resource.js';
import type { Listed } from './property.js';

export type ComponentValues = { readonly [K in Component.Name]: Component.Value<K> };
export type ResourceValues = { readonly [K in Resource.Name]: Resource.Value<K> };

/** `Read` values are read-only, `Write` values writable. */
export type Values<Read, Write, Names extends PropertyKey, Types> =
    { readonly [K in Exclude<Read, Write> & Names]: Types[K & keyof Types] }
    & { -readonly [K in Write & Names]: Types[K & keyof Types] };

export type LookupFunction<L> = (entity: Entity) => { readonly [K in Listed<L, "read"> & Component.Name]: Component.Value<K> } | null;
