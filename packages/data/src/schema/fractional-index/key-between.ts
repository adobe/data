// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { FractionalIndex } from "./fractional-index.js";
import { decrementInteger } from "./decrement-integer.js";
import { incrementInteger } from "./increment-integer.js";
import { integerPart } from "./integer-part.js";
import { midpoint } from "./midpoint.js";
import { smallestInteger } from "./smallest-integer.js";
import { validateOrderKey } from "./validate-order-key.js";

export const keyBetween = (
    a: FractionalIndex | undefined,
    b: FractionalIndex | undefined,
): FractionalIndex => {
    if (a !== undefined) validateOrderKey(a);
    if (b !== undefined) validateOrderKey(b);
    if (a !== undefined && b !== undefined && a >= b) {
        throw new Error("Invalid key order: a >= b");
    }

    if (a === undefined && b === undefined) return "a0";

    if (a === undefined) {
        const ib = integerPart(b!);
        const fb = b!.slice(ib.length);
        if (ib === smallestInteger) return ib + midpoint("", fb);
        return ib < b! ? ib : decrementInteger(ib)!;
    }

    if (b === undefined) {
        const ia = integerPart(a);
        const fa = a.slice(ia.length);
        const i = incrementInteger(ia);
        return i === undefined ? ia + midpoint(fa, undefined) : i;
    }

    const ia = integerPart(a);
    const fa = a.slice(ia.length);
    const ib = integerPart(b);
    const fb = b.slice(ib.length);
    if (ia === ib) return ia + midpoint(fa, fb);
    const i = incrementInteger(ia)!;
    return i < b ? i : ia + midpoint(fa, undefined);
};
