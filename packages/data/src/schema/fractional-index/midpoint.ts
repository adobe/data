// © 2026 Adobe. MIT License. See /LICENSE for details.
import { digits as BASE_DIGITS } from "./digits.js";

export const midpoint = (a: string, b: string | undefined, d = BASE_DIGITS): string => {
    if (b !== undefined && a >= b) throw new Error("Invalid midpoint args: a >= b");
    if (a.slice(-1) === "0" || (b && b.slice(-1) === "0")) throw new Error("trailing zero");

    if (b) {
        let n = 0;
        while ((a.charAt(n) || "0") === b.charAt(n)) n++;
        if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n), d);
    }

    const digitA = a ? d.indexOf(a.charAt(0)) : 0;
    const digitB = b !== undefined ? d.indexOf(b.charAt(0)) : d.length;
    if (digitB - digitA > 1) return d.charAt(Math.round(0.5 * (digitA + digitB)));
    if (b && b.length > 1) return b.slice(0, 1);
    return d.charAt(digitA) + midpoint(a.slice(1), undefined, d);
};
