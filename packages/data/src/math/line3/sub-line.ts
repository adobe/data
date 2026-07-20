// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Line3 } from "./index.js";
import { interpolate } from "./interpolate.js";

export const subLine = (line: Line3, alpha: number, beta: number): Line3 => {
    return {
        a: interpolate(line, alpha),
        b: interpolate(line, beta),
    };
};
