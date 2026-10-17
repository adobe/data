import type { Component } from '../component/component.js';
import type { Resource } from '../resource/resource.js';
import type { IsStruct } from '../schema/is-struct.js';

/** Components whose values are structs, which kernels read and write. */
export type StructComponent = { [K in Component.Name]: IsStruct<Component.Value<K>> extends true ? K : never }[Component.Name];

/** Resources whose values are structs, which kernels read. */
export type StructResource = { [K in Resource.Name]: IsStruct<Resource.Value<K>> extends true ? K : never }[Resource.Name];
