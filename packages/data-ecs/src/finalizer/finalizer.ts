import type { Name } from './name.js';

/** A finalizer, known by its name. */
export type Finalizer<N extends Name = Name> = { readonly name: N };

export * as Finalizer from './index.js';
