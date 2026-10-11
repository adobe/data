import type { Component } from '../../component/component.js';
import type { Filter } from './filter.js';
import type { Order } from './order.js';

/** Narrows a query of entities that have every included component. */
export type Options<C extends readonly Component.Name[]> = {
    readonly not?: readonly Component.Name[];
    readonly where?: Filter<Component.ValuesOf<C>>;
    readonly order?: Order<Component.ValuesOf<C>>;
};
