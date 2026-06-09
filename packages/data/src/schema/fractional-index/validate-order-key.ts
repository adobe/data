// © 2026 Adobe. MIT License. See /LICENSE for details.
import { integerPart } from "./integer-part.js";
import { smallestInteger } from "./smallest-integer.js";

export const validateOrderKey = (key: string): void => {
    if (key === smallestInteger) throw new Error("invalid order key");
    const i = integerPart(key);
    if (key.slice(i.length).slice(-1) === "0") throw new Error("invalid order key");
};
