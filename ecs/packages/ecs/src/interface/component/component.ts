// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Key } from './key.js';
import type { Type } from './value.js';

/**
 * The type of component `K`'s value, as its record in `Components` declares it: `Component<typeof position>`. The
 * namespace's `Key` and `With` name components' keys.
 */
export type Component<K extends Key> = Type<K>;

export * as Component from './index.js';
