// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Line2 } from "./index.js";
import { interpolate } from "./interpolate.js";

export const subLine = (line: Line2, alpha: number, beta: number): Line2 => {
    return {
        a: interpolate(line, alpha),
        b: interpolate(line, beta),
    };
};
