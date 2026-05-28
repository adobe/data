// © 2026 Adobe. MIT License. See /LICENSE for details.
import { digits } from "./digits.js";
import { validateInteger } from "./validate-integer.js";

export const decrementInteger = (x: string): string | undefined => {
    validateInteger(x);
    const [head, ...digs] = x.split("");
    let borrow = true;
    for (let i = digs.length - 1; borrow && i >= 0; i--) {
        const d = digits.indexOf(digs[i]) - 1;
        if (d === -1) {
            digs[i] = digits.slice(-1);
        } else {
            digs[i] = digits.charAt(d);
            borrow = false;
        }
    }
    if (borrow) {
        if (head === "a") return "Z" + digits.slice(-1);
        if (head === "A") return undefined;
        const h = String.fromCharCode(head.charCodeAt(0) - 1);
        if (h < "Z") digs.push(digits.slice(-1)); else digs.pop();
        return h + digs.join("");
    }
    return head + digs.join("");
};
