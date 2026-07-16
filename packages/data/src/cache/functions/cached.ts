// © 2026 Adobe. MIT License. See /LICENSE for details.

import { getCached } from "./get-cached.js";

/**
 * Returns a function with the same signature as the factory, caching its result per object.
 * Uses the same cache as {@link getCached}, so values are shared when the same factory is used.
 *
 * @param factory A function that creates the value to be cached
 * @returns A function that returns the cached value or a newly created value from the factory
 */
export function cached<A extends object, B>(
    factory: (obj: A) => B
): (obj: A) => B {
    return (obj: A) => getCached(obj, factory);
}
