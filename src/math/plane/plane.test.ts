// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { Plane, Vec3, Line3 } from "../index.js";

describe("Plane", () => {
    const xyPlane: Plane = {
        normal: [0, 0, 1], // pointing up
        distance: 0 // plane at origin
    };

    const xyPlaneOffset: Plane = {
        normal: [0, 0, 1], // pointing up
        distance: 5 // plane 5 units above origin
    };

    describe("signedDistance", () => {
        it("should return 0 for points on the plane", () => {
            expect(Plane.signedDistance(xyPlane, [0, 0, 0])).toBe(0);
            expect(Plane.signedDistance(xyPlane, [5, 3, 0])).toBe(0);
        });

        it("should return positive distance for points in front of plane", () => {
            expect(Plane.signedDistance(xyPlane, [0, 0, 1])).toBe(1);
            expect(Plane.signedDistance(xyPlane, [0, 0, 5])).toBe(5);
        });

        it("should return negative distance for points behind plane", () => {
            expect(Plane.signedDistance(xyPlane, [0, 0, -1])).toBe(-1);
            expect(Plane.signedDistance(xyPlane, [0, 0, -3])).toBe(-3);
        });

        it("should work with offset planes", () => {
            expect(Plane.signedDistance(xyPlaneOffset, [0, 0, 5])).toBe(0); // on plane
            expect(Plane.signedDistance(xyPlaneOffset, [0, 0, 7])).toBe(2); // 2 units above
            expect(Plane.signedDistance(xyPlaneOffset, [0, 0, 3])).toBe(-2); // 2 units below
        });
    });

    describe("distance", () => {
        it("should return absolute distance", () => {
            expect(Plane.distance(xyPlane, [0, 0, 3])).toBe(3);
            expect(Plane.distance(xyPlane, [0, 0, -3])).toBe(3);
            expect(Plane.distance(xyPlane, [0, 0, 0])).toBe(0);
        });
    });

    describe("containsPoint", () => {
        it("should return true for points on the plane", () => {
            expect(Plane.containsPoint(xyPlane, [0, 0, 0])).toBe(true);
            expect(Plane.containsPoint(xyPlane, [5, 3, 0])).toBe(true);
        });

        it("should return false for points off the plane", () => {
            expect(Plane.containsPoint(xyPlane, [0, 0, 0.001])).toBe(false);
            expect(Plane.containsPoint(xyPlane, [0, 0, -0.001])).toBe(false);
        });
    });

    describe("isPointInFront", () => {
        it("should return true for points in front of plane", () => {
            expect(Plane.isPointInFront(xyPlane, [0, 0, 1])).toBe(true);
            expect(Plane.isPointInFront(xyPlane, [0, 0, 5])).toBe(true);
        });

        it("should return false for points behind or on plane", () => {
            expect(Plane.isPointInFront(xyPlane, [0, 0, 0])).toBe(false);
            expect(Plane.isPointInFront(xyPlane, [0, 0, -1])).toBe(false);
        });
    });

    describe("isPointBehind", () => {
        it("should return true for points behind plane", () => {
            expect(Plane.isPointBehind(xyPlane, [0, 0, -1])).toBe(true);
            expect(Plane.isPointBehind(xyPlane, [0, 0, -5])).toBe(true);
        });

        it("should return false for points in front or on plane", () => {
            expect(Plane.isPointBehind(xyPlane, [0, 0, 0])).toBe(false);
            expect(Plane.isPointBehind(xyPlane, [0, 0, 1])).toBe(false);
        });
    });

    describe("lineIntersection", () => {
        it("should find intersection alpha for line crossing plane", () => {
            const line: Line3 = { a: [0, 0, -1], b: [0, 0, 1] }; // vertical line
            const alpha = Plane.lineIntersection(xyPlane, line);
            expect(alpha).toBe(0.5); // intersects at midpoint
        });

        it("should find intersection alpha for diagonal line", () => {
            const line: Line3 = { a: [1, 1, -1], b: [1, 1, 1] }; // diagonal line
            const alpha = Plane.lineIntersection(xyPlane, line);
            expect(alpha).toBe(0.5); // intersects at midpoint
        });

        it("should find intersection alpha for offset plane", () => {
            const line: Line3 = { a: [0, 0, 3], b: [0, 0, 7] }; // line above offset plane
            const alpha = Plane.lineIntersection(xyPlaneOffset, line);
            expect(alpha).toBe(0.5); // intersects at midpoint (z=5)
        });

        it("should return null for line parallel to plane", () => {
            const line: Line3 = { a: [0, 0, 1], b: [1, 0, 1] }; // horizontal line
            const alpha = Plane.lineIntersection(xyPlane, line);
            expect(alpha).toBeNull();
        });

        it("should return null for line in the plane", () => {
            const line: Line3 = { a: [0, 0, 0], b: [1, 0, 0] }; // line in xy plane
            const alpha = Plane.lineIntersection(xyPlane, line);
            expect(alpha).toBeNull();
        });

        it("should handle line that doesn't intersect within segment", () => {
            const line: Line3 = { a: [0, 0, 2], b: [0, 0, 4] }; // line above plane
            const alpha = Plane.lineIntersection(xyPlane, line);
            expect(alpha).toBe(-1); // intersection exists but before segment start
        });

        it("should handle alpha values outside segment", () => {
            const line: Line3 = { a: [0, 0, 2], b: [0, 0, 6] }; // line from z=2 to z=6
            const alpha = Plane.lineIntersection(xyPlane, line);
            expect(alpha).toBe(-0.5); // intersects at z=0, which is before segment start
        });

        it("should handle alpha values after segment end", () => {
            const line: Line3 = { a: [0, 0, -2], b: [0, 0, -1] }; // line from z=-2 to z=-1
            const alpha = Plane.lineIntersection(xyPlane, line);
            expect(alpha).toBe(2); // intersects at z=0, which is after segment end
        });
    });
});
