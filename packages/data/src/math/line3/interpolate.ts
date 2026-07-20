// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Line3 } from "./index.js";
import type { Vec3 } from "../vec3/index.js";

export const interpolate = (line: Line3, alpha: number): Vec3 => {
    const a = line.a;
    const b = line.b;
    return [a[0] + alpha * (b[0] - a[0]), a[1] + alpha * (b[1] - a[1]), a[2] + alpha * (b[2] - a[2])];
};
