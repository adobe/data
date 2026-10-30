// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from '../component/component.js';
import type { Resource } from '../resource/resource.js';
import type { Table } from '../world/table/table.js';

/**
 * What a readonly system's `tables` reads: of every archetype matching `with` and `not` that holds any of
 * `components`, a table of those it holds; and, with `resources`, each resource's value.
 */
export type TablesDeclaration = {
    readonly components: readonly Component.Key[];
    readonly with?: readonly Component.Key[];
    readonly not?: readonly Component.Key[];
    readonly resources?: readonly Resource.Key[];
};

/** A readonly system's `tables`: a table of each archetype its declaration reads, and the values of the resources it reads. */
export type Tables = {
    readonly archetypes: readonly Table[];
    readonly resources: { readonly [K in Resource.Key]?: Resource<K> };
};
