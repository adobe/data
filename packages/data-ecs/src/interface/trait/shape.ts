import type { Schema } from '../schema/schema.js';
import type { Key } from './key.js';
import type { AnyObjectType } from './object.js';

/**
 * What every declaration is: `type`, a schema or `object<T>()`, the traits it lists, and, beside `object<T>()`, the
 * `default` the value starts at.
 */
export type Shape = { readonly type: Schema | AnyObjectType; readonly default?: unknown } & { readonly [T in Exclude<Key, "type">]?: unknown };
