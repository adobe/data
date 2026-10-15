import type { Component } from '../../component/component.js';
import type { Filter } from './filter.js';
import type { Order } from './order.js';
import type { ValuesOf } from '../../component/values-of.js';

/** Narrows a query of entities that have every component in `has`. */
export type Options<C extends readonly Component.Name[]> = {
    readonly not?: readonly Component.Name[];
    readonly where?: Filter<ValuesOf<C>>;
    readonly order?: Order<ValuesOf<C>>;
};
