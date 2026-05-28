// © 2026 Adobe. MIT License. See /LICENSE for details.
import { integerLength } from "./integer-length.js";

export const validateInteger = (s: string): void => {
    if (s.length !== integerLength(s.charAt(0))) throw new Error("invalid integer part of order key");
};
