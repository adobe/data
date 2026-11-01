// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from '../component/component.js';
import type { Shared } from '../component/value.js';
import type { Resource } from '../resource/resource.js';
import type { Table } from '../world/table/table.js';

/**
 * What a readonly system's `tables` reads: of every archetype matching `with`, `not` and `where` that holds any of
 * `components`, a table of those it holds; and, with `resources`, each resource's value.
 */
export type TablesDeclaration = {
    readonly components: readonly Component.Key[];
    readonly with?: readonly Component.Key[];
    readonly not?: readonly Component.Key[];
    /**
     * Keeps the tables to the archetypes holding these values of shared components, each one required as `with`
     * requires it, as a system's `where` of values keeps its system to them.
     */
    readonly where?: { readonly [K in Shared]?: Component<K> };
    readonly resources?: readonly Resource.Key[];
};

/** A readonly system's `tables`: a table of each archetype its declaration reads, and the values of the resources it reads. */
export type Tables = {
    readonly archetypes: readonly Table[];
    readonly resources: { readonly [K in Resource.Key]?: Resource<K> };
};
