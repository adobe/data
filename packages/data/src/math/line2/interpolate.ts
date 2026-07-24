// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Line2 } from "./index.js";
import type { Vec2 } from "../vec2/index.js";

export const interpolate = (line: Line2, alpha: number): Vec2 => {
    const a = line.a;
    const b = line.b;
    return [a[0] + alpha * (b[0] - a[0]), a[1] + alpha * (b[1] - a[1])];
};
