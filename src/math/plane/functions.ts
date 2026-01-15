// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Plane } from "./index.js";
import type { Vec3 } from "../vec3/index.js";
import type { Line3 } from "../line3/index.js";
import { Vec3 as Vec3Namespace } from "../vec3/index.js";
import { epsilon } from "../constants.js";

export function is(value: any): value is Plane {
    return value && typeof value === 'object' && 'normal' in value && 'distance' in value;
}

// Plane utility functions
export const signedDistance = (plane: Plane, point: Vec3): number => 
    Vec3Namespace.dot(plane.normal, point) - plane.distance;

export const distance = (plane: Plane, point: Vec3): number => 
    Math.abs(signedDistance(plane, point));

export const containsPoint = (plane: Plane, point: Vec3): boolean => 
    Math.abs(signedDistance(plane, point)) < epsilon;

export const isPointInFront = (plane: Plane, point: Vec3): boolean => 
    signedDistance(plane, point) > 0;

export const isPointBehind = (plane: Plane, point: Vec3): boolean => 
    signedDistance(plane, point) < 0;

/**
 * Find the intersection alpha between a line and a plane.
 * @param plane The plane to intersect with
 * @param line The line to intersect
 * @returns The alpha parameter (0-1 = within segment, <0 or >1 = outside segment), or null if line is parallel to plane
 */
export const lineIntersection = (plane: Plane, line: Line3): number | null => {
    const { a, b } = line;
    
    // Calculate line direction vector
    const direction = Vec3Namespace.subtract(b, a);
    
    // Calculate denominator: dot(normal, direction)
    const denominator = Vec3Namespace.dot(plane.normal, direction);
    
    // If denominator is close to zero, line is parallel to plane
    if (Math.abs(denominator) < epsilon) {
        return null;
    }
    
    // Calculate numerator: dot(normal, a) - distance
    const numerator = Vec3Namespace.dot(plane.normal, a) - plane.distance;
    
    // Calculate parameter t (alpha)
    const alpha = -numerator / denominator;
    
    return alpha;
};

