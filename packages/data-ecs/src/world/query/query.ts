import type { Component } from '../../component/component.js';
import type { Filter } from './filter.js';
import type { Order } from './order.js';
import type { ValuesOf } from '../../component/values-of.js';

/**
 * Entities that have every component in `required`, every entity without it, and none in `not`, filtered by `where`
 * and sorted by `order`, which name only required components.
 */
export type Query<R extends readonly Component.Name[]> = {
    readonly required?: R;
    readonly not?: readonly Component.Name[];
    readonly where?: Filter<ValuesOf<R>>;
    readonly order?: Order<ValuesOf<R>>;
};
