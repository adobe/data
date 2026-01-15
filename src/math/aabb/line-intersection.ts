// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec3 } from "../vec3/index.js";
import type { Aabb } from "./index.js";

/**
 * @returns the alpha distance along the line (0-1) where the line intersects the box or -1 if it does not.
 * @param radius - The radius of the line (treats line as a cylinder). Defaults to 0.
 */
export const lineIntersection = (box: Aabb, line: { a: Vec3; b: Vec3; }, radius: number = 0): number => {
    const { min, max } = box;
    const { a, b } = line;

    // Expand the box by the radius to treat the line as a cylinder
    const expandedMin = [min[0] - radius, min[1] - radius, min[2] - radius];
    const expandedMax = [max[0] + radius, max[1] + radius, max[2] + radius];

    // Calculate line direction vector
    const dir = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];

    // Calculate intersection parameters for each axis
    const tMinX = (expandedMin[0] - a[0]) / dir[0];
    const tMaxX = (expandedMax[0] - a[0]) / dir[0];
    const tMinY = (expandedMin[1] - a[1]) / dir[1];
    const tMaxY = (expandedMax[1] - a[1]) / dir[1];
    const tMinZ = (expandedMin[2] - a[2]) / dir[2];
    const tMaxZ = (expandedMax[2] - a[2]) / dir[2];

    // Handle division by zero (line parallel to axis)
    const tMinXFinal = dir[0] >= 0 ? tMinX : tMaxX;
    const tMaxXFinal = dir[0] >= 0 ? tMaxX : tMinX;
    const tMinYFinal = dir[1] >= 0 ? tMinY : tMaxY;
    const tMaxYFinal = dir[1] >= 0 ? tMaxY : tMinY;
    const tMinZFinal = dir[2] >= 0 ? tMinZ : tMaxZ;
    const tMaxZFinal = dir[2] >= 0 ? tMaxZ : tMinZ;

    // Find the largest minimum and smallest maximum
    const tMin = Math.max(tMinXFinal, tMinYFinal, tMinZFinal);
    const tMax = Math.min(tMaxXFinal, tMaxYFinal, tMaxZFinal);

    // Check if intersection exists
    if (tMax < tMin || tMax < 0) {
        return -1;
    }

    // If tMin is negative, the line starts inside the box
    const alpha = tMin < 0 ? 0 : tMin;

    // Check if the intersection point is within the line segment (0-1)
    if (alpha > 1) {
        return -1;
    }

    return alpha;
};
