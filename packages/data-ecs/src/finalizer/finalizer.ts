/** A finalizer, known by its name. */
export type Finalizer<N extends string = string> = { readonly name: N };

export * as Finalizer from './index.js';
