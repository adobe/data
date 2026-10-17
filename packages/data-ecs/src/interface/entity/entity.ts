declare const entityBrand: unique symbol;

/**
 * An entity id, live or not: `index + generation * 2^32`. Branded so entity-valued components and fields are visible
 * to types and schemas; it costs nothing at runtime. Index 0 is never an entity, so a zeroed value means none.
 */
export type Entity = number & { readonly [entityBrand]: true };

export * as Entity from './index.js';
