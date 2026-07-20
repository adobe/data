// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Line3 } from "./index.js";
import type { Vec3 } from "../vec3/index.js";
import { Vec3 as Vec3Namespace } from "../vec3/index.js";

/**
 * Returns a unit vector pointing from line.a to line.b. If the line has zero length,
 * returns the provided default direction (defaults to [0,0,1]).
 */
export const direction = (line: Line3): Vec3 => {
    const delta = Vec3Namespace.subtract(line.b, line.a);
    const len = Vec3Namespace.length(delta);
    return len === 0 ? [0, 0, 1] : Vec3Namespace.normalize(delta);
};
