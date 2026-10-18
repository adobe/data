import type { Declaration } from './declaration.js';

/** A rule: entities matching its components have the components it derives. */
export type Rule<D extends Declaration = Declaration> = { readonly kind: "rule"; readonly name: string; readonly declaration: D };
