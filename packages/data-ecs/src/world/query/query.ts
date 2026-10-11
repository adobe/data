import type { Component } from '../../component/component.js';
import type { Entity } from '../../entity/entity.js';
import type { Options } from './options.js';

export type Query = {
    /** Entities that have every included component and none of `not`. */
    select<const C extends readonly Component.Name[]>(include: C, options?: Options<C>): readonly Entity[];
    /** Number of entities `select` would return, without building the array. */
    count<const C extends readonly Component.Name[]>(include: C, options?: Options<C>): number;
};

export * as Query from './index.js';
