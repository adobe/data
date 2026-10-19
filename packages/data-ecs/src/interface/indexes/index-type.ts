import type { Declaration } from './declaration.js';

declare const declared: unique symbol;

/**
 * An index, the value `Index.create` returned: identified by that value, labeled by its name. `D` is the type of the
 * declaration it was created from, which its lookups take their key and rows from; code accepting any sorted index
 * takes `Index<{ readonly sorted: true }>`.
 */
export type Index<D extends object = Declaration> = { readonly name: string; readonly [declared]?: D };

export * as Index from './index.js';
