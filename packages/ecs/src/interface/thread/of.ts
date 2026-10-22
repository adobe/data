// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { IsShared } from '../schema/is-struct.js';
import type { Thread } from './thread.js';

/**
 * The thread a value of type `T` declared with traits `Entry` lives on: none for a struct or a string, else its `thread`
 * or `"world"`.
 */
export type ThreadOf<Entry, T> = IsShared<T> extends true ? never : Entry extends { readonly thread: infer H extends Thread } ? H : "world";
