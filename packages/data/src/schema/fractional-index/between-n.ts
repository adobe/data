// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { FractionalIndex } from "./fractional-index.js";
import { keyBetween } from "./key-between.js";

export const betweenN = (
    a: FractionalIndex | undefined,
    b: FractionalIndex | undefined,
    n: number,
): FractionalIndex[] => {
    if (n === 0) return [];
    if (n === 1) return [keyBetween(a, b)];

    if (b === undefined) {
        let c = keyBetween(a, b);
        const result = [c];
        for (let i = 0; i < n - 1; i++) {
            c = keyBetween(c, b);
            result.push(c);
        }
        return result;
    }

    if (a === undefined) {
        let c = keyBetween(a, b);
        const result = [c];
        for (let i = 0; i < n - 1; i++) {
            c = keyBetween(a, c);
            result.push(c);
        }
        result.reverse();
        return result;
    }

    const mid = Math.floor(n / 2);
    const c = keyBetween(a, b);
    return [
        ...betweenN(a, c, mid),
        c,
        ...betweenN(c, b, n - mid - 1),
    ];
};
