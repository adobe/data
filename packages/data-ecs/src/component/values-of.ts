import type { Name } from './name.js';
import type { Types } from './types.js';

/** The values of the listed components, keyed by component. */
export type ValuesOf<C extends readonly Name[]> = { readonly [K in C[number]]: Types[K] };
