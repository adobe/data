import type { Declaration } from './declaration.js';

/** A rule: entities matching its query have the components it derives. */
export type Rule<D extends Declaration = Declaration> = { readonly declaration: D };

export * as Rule from './index.js';
