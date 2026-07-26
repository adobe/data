// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { orientNormalAgainstRay } from "./orient-normal-against-ray.js";

describe("orientNormalAgainstRay", () => {
    it("normalizes the normal to unit length", () => {
        const n: [number, number, number] = [0, 3, 0];
        orientNormalAgainstRay(n, 1, 0, 0); // ray perpendicular → no flip
        expect(Math.hypot(...n)).toBeCloseTo(1, 6);
        expect(n[1]).toBeCloseTo(1, 6);
    });

    it("flips a normal that points along the ray so it opposes it", () => {
        const n: [number, number, number] = [0, -1, 0]; // points down, same as a downward ray
        orientNormalAgainstRay(n, 0, -20, 0);            // downward ray
        expect(n[1]).toBeGreaterThan(0);                 // now points up, opposing the ray
    });

    it("leaves a normal that already opposes the ray unchanged in direction", () => {
        const n: [number, number, number] = [0, 1, 0];
        orientNormalAgainstRay(n, 0, -20, 0);
        expect(n[1]).toBeCloseTo(1, 6);
    });

    it("leaves a zero-length normal as the zero vector (no divide-by-zero)", () => {
        const n: [number, number, number] = [0, 0, 0];
        orientNormalAgainstRay(n, 0, -1, 0);
        expect(n).toEqual([0, 0, 0]);
    });
});
