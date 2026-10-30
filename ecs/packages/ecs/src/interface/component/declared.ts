// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Schema } from '../schema/schema.js';
import type { Key as TraitKey } from '../trait/key.js';

/**
 * A component's or resource's declaration as registered: its schema as `type` where its value is data, what it
 * starts at as `default`, and its other traits, the built-in ones by name and those of your own by their keys.
 */
export type Declared = { readonly type?: Schema; readonly default?: unknown } & { readonly [T in TraitKey]?: unknown };
