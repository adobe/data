// © 2026 Adobe. MIT License. See /LICENSE for details.
declare const input: unique symbol;
declare const result: unique symbol;

/**
 * A system, the value a System constructor returned: identified by that value and labeled by `name`, the binding it's
 * declared at. `run` takes it with a value of type `I`, or with nothing when `I` is `undefined`, and resolves to `R`.
 */
export type System<I = undefined, R = void> = { readonly name: string; readonly [input]?: I; readonly [result]?: () => R };

export * as System from './index.js';
