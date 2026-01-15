// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Assert } from "../types/assert.js";
import { Equal } from "../types/equal.js";

/**
 * Calls each function in the object with the argument and returns an object
 * with the same keys and the return values of the functions.
 */
export function applyArg<A, T extends Record<string, (a: A) => any>>(
    arg: A,
    toFunctions: T,
): {
        [K in keyof T]: T[K] extends (a: A) => infer R ? R : never;
    } {
    const result = {} as any;
    for (const key in toFunctions) {
        result[key] = toFunctions[key](arg);
    }
    return result;
}

(() => {
    const foo = {
        a: (a: number) => () => a + 1,
        b: (a: number) => (b: number) => a + b,
    }
    const bar = applyArg(1, foo);
    type Check = Assert<Equal<typeof bar, { a: () => number; b: (b: number) => number }>>;
})