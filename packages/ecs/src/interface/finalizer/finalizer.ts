/**
 * A finalizer, the value `Finalizer.create` or `Finalizer.changes` returned: identified by that value, labeled by its
 * name, and listed in other finalizers' `before` and `after`.
 */
export type Finalizer = { readonly name: string };

export * as Finalizer from './index.js';
