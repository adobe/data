import type { Name } from './name.js';
import type { Value } from './value.js';

/** Values for any subset of components, keyed by component. */
export type Values = { readonly [K in Name]?: Value<K> };
