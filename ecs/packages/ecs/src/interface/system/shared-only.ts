// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Shared } from '../component/value.js';

/** A `where`'s keys that aren't shared components, each an error: `where` names only shared components. */
export type SharedOnly<W> = { readonly [K in Exclude<keyof W, Shared>]: { readonly "error: where names only shared components, which each archetype holds one value of": K } };
