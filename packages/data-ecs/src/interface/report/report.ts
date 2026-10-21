import type { Component } from '../component/component.js';
import type { Archetype } from './index.js';

/**
 * A report's values, as rows and lookups give them. After the sync point of each run or tick that isn't clean, the
 * world spawns a report: any failure, skipped system, dropped command or warning. A run's number with no report means
 * it succeeded.
 */
export type Report = { readonly [K in (typeof Archetype)[number]]: Component.Value<K> };

export * as Report from './index.js';
