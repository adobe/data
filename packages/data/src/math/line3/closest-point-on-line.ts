// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Line3 } from "./index.js";
import type { Vec3 } from "../vec3/index.js";
import { Vec3 as Vec3Namespace } from "../vec3/index.js";

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
