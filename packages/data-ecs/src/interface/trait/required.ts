import type { IsNode } from '../platform/platform.js';

/**
 * The traits a declaration must have beyond those it lists, by its entry `E`: a DOM `Node` lives on `"main"`, so a
 * declaration of one without `thread` can't be registered. Where the DOM library isn't loaded, nothing is required.
 */
export type Required<E extends { readonly type: unknown }> = IsNode<E["type"]> extends true ? (E extends { readonly thread: unknown } ? {} : { readonly thread: "main" }) : {};
