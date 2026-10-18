import type { Component } from '../component/component.js';
import type { ValuesOf } from '../component/values-of.js';
import type { Filter } from './filter.js';
import type { Order } from './order.js';

/**
 * Entities that have every component in `required`, every entity without it, and none in `not`, filtered by `where`
 * and sorted by `order`, which name only required components, then sliced by `page`.
 */
export type Query<R extends readonly Component.Key[]> = {
    readonly required?: R;
    readonly not?: readonly Component.Key[];
    readonly where?: Filter<ValuesOf<R>>;
    readonly order?: Order<ValuesOf<R>>;
    /** Only these results, after `where` and `order`. Without `order` they follow storage order, so stable pages need one. */
    readonly page?: { readonly offset: number; readonly limit: number };
};
