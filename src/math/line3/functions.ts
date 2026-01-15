// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Line3 } from "./index.js";
import type { Vec3 } from "../vec3/index.js";
import { Vec3 as Vec3Namespace } from "../vec3/index.js";

// Line3 utility functions
export const interpolate = (line: Line3, alpha: number): Vec3 => {
    const a = line.a;
    const b = line.b;
    return [a[0] + alpha * (b[0] - a[0]), a[1] + alpha * (b[1] - a[1]), a[2] + alpha * (b[2] - a[2])];
};

/**
 * Calculates the alpha value (0-1) representing the closest point on a line to a given point.
 * 
 * @param line - The line segment
 * @param point - The point in 3D space
 * @returns Alpha value, usually between 0 and 1, where 0 is line.a and 1 is line.b
 */
export const closestPointOnLine = (line: Line3, point: Vec3): number => {
    const { a, b } = line;

    // Calculate the direction vector of the line
    const lineDirection = Vec3Namespace.subtract(b, a);

    // Calculate the vector from line start to the point
    const pointToStart = Vec3Namespace.subtract(point, a);

    // Calculate the dot product to find the projection
    const dotProduct = Vec3Namespace.dot(pointToStart, lineDirection);
    const lineLengthSquared = Vec3Namespace.dot(lineDirection, lineDirection);

    // Avoid division by zero
    if (lineLengthSquared === 0) {
        return 0;
    }

    // Calculate alpha (projection parameter)
    const alpha = dotProduct / lineLengthSquared;

    // Do not clamp alpha, it can be outside of [0, 1]
    // User can clamp after if they want to.
    return alpha;
};

export const subLine = (line: Line3, alpha: number, beta: number): Line3 => {
    return {
        a: interpolate(line, alpha),
        b: interpolate(line, beta),
    };
};

/**
 * Returns a unit vector pointing from line.a to line.b. If the line has zero length,
 * returns the provided default direction (defaults to [0,0,1]).
 */
export const direction = (line: Line3): Vec3 => {
    const delta = Vec3Namespace.subtract(line.b, line.a);
    const len = Vec3Namespace.length(delta);
    return len === 0 ? [0, 0, 1] : Vec3Namespace.normalize(delta);
};

