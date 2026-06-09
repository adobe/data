// © 2026 Adobe. MIT License. See /LICENSE for details.
import { integerLength } from "./integer-length.js";

export const integerPart = (key: string): string => {
    const len = integerLength(key.charAt(0));
    if (len > key.length) throw new Error("invalid order key");
    return key.slice(0, len);
};
