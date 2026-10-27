// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from '../component/component.js';
import type { Resource } from '../resource/resource.js';
import type { IsStruct } from '../schema/is-struct.js';

/** Components whose values are structs, which kernels read and write. */
export type StructComponent = { [K in Component.Key]: IsStruct<Component.Type<K>> extends true ? K : never }[Component.Key];

/** Resources whose values are structs, which kernels read. */
export type StructResource = { [K in Resource.Key]: IsStruct<Resource.Type<K>> extends true ? K : never }[Resource.Key];
