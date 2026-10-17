declare const input: unique symbol;

/** A system, known by its name. `run` takes it with a value of type `I`, or with nothing when `I` is `undefined`. */
export type System<I = undefined> = { readonly name: string; readonly [input]?: I };

export * as System from './index.js';
