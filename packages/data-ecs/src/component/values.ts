import type { Name } from './name.js';
import type { Types } from './types.js';

/** Values for any subset of components, keyed by component. */
export type Values = { readonly [K in Name]?: Types[K] };
