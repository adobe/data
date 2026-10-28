// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Key } from './key.js';
import type { Type } from './value.js';

/** The type of resource `K`'s value, as its record in `Resources` declares it: `Resource<typeof clock>`. */
export type Resource<K extends Key> = Type<K>;

export * as Resource from './index.js';
