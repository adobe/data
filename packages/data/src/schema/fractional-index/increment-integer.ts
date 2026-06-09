// © 2026 Adobe. MIT License. See /LICENSE for details.
import { digits } from "./digits.js";
import { validateInteger } from "./validate-integer.js";

export const incrementInteger = (x: string): string | undefined => {
    validateInteger(x);
    const [head, ...digs] = x.split("");
    let carry = true;
    for (let i = digs.length - 1; carry && i >= 0; i--) {
        const d = digits.indexOf(digs[i]) + 1;
        if (d === digits.length) {
            digs[i] = "0";
        } else {
            digs[i] = digits.charAt(d);
            carry = false;
        }
    }
    if (carry) {
        if (head === "Z") return "a0";
        if (head === "z") return undefined;
        const h = String.fromCharCode(head.charCodeAt(0) + 1);
        if (h > "a") digs.push("0"); else digs.pop();
        return h + digs.join("");
    }
    return head + digs.join("");
};
