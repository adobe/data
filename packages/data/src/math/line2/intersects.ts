// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Line2 } from "./index.js";
import { epsilon } from "../constants.js";

export const intersects = (line1: Line2, line2: Line2, includeEndpoints = false): boolean => {
    const a = line1.a;
    const b = line1.b;
    const c = line2.a;
    const d = line2.b;

    // Check for endpoint intersections
    if (includeEndpoints && (
        (Math.abs(a[0] - c[0]) < epsilon && Math.abs(a[1] - c[1]) < epsilon) ||
        (Math.abs(a[0] - d[0]) < epsilon && Math.abs(a[1] - d[1]) < epsilon) ||
        (Math.abs(b[0] - c[0]) < epsilon && Math.abs(b[1] - c[1]) < epsilon) ||
        (Math.abs(b[0] - d[0]) < epsilon && Math.abs(b[1] - d[1]) < epsilon)
    )) {
        return true;
    }

    // Calculate the denominator
    const denominator = (d[0] - c[0]) * (b[1] - a[1]) - (d[1] - c[1]) * (b[0] - a[0]);

    // Check if lines are parallel or collinear
    if (Math.abs(denominator) < epsilon) {
        return false;
    }

    // Calculate intersection parameters
    const numerator1 = (d[1] - c[1]) * (a[0] - c[0]) - (d[0] - c[0]) * (a[1] - c[1]);
    const numerator2 = (b[1] - a[1]) * (a[0] - c[0]) - (b[0] - a[0]) * (a[1] - c[1]);

    const ua = numerator1 / denominator;
    const ub = numerator2 / denominator;

    // Check if intersection point lies within both line segments
    return ua >= -epsilon && ua <= 1 + epsilon && ub >= -epsilon && ub <= 1 + epsilon;
};
