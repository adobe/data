import type { IsStruct } from '../schema/is-struct.js';
import type { Thread } from './thread.js';

/** The thread a value of type `T` declared with traits `Entry` lives on: none for a struct, else its `thread` or `"world"`. */
export type ThreadOf<Entry, T> = IsStruct<T> extends true ? never : Entry extends { readonly thread: infer H extends Thread } ? H : "world";
