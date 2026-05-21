// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { FractionalIndex } from "./fractional-index.js";
import { keyBetween } from "./key-between.js";

export const between = (
    a: FractionalIndex | undefined,
    b: FractionalIndex | undefined,
): FractionalIndex => keyBetween(a, b);
