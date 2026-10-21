declare const entityBrand: unique symbol;

/**
 * An entity id, live or not: a branded number; 0 is none. The brand makes entity-valued components and fields visible
 * to types and schemas, and costs nothing at runtime.
 */
export type Entity = number & { readonly [entityBrand]: true };

export * as Entity from './index.js';
