// © 2026 Adobe. MIT License. See /LICENSE for details.
declare const input: unique symbol;

/**
 * A system, the value a System constructor returned: identified by that value and labeled by its name. `run` takes it
 * with a value of type `I`, or with nothing when `I` is `undefined`.
 */
export type System<I = undefined> = { readonly name: string; readonly [input]?: I };

export * as System from './index.js';
