import type { IsNode } from '../platform/platform.js';

/**
 * The traits a declaration must have beyond those it lists: a DOM `Node` lives on `"main"`, so a declaration of one
 * without `thread` can't be registered. Where the DOM library isn't loaded, nothing is required.
 */
export type Required<Entry, T> = IsNode<T> extends true ? (Entry extends { readonly thread: unknown } ? {} : { readonly thread: "main" }) : {};
