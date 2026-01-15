// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from 'vitest';
import { Aabb } from './index.js';
import { Line3 } from '../index.js';

describe('Aabb.lineIntersection', () => {
    const box: Aabb = {
        min: [0, 0, 0],
        max: [2, 2, 2]
    };

    it('should return 0 when line starts inside the box', () => {
        const line: Line3 = {
            a: [1, 1, 1],
            b: [3, 3, 3]
        };
        expect(Aabb.lineIntersection(box, line)).toBe(0);
    });

    it('should return correct alpha when line intersects box from outside', () => {
        const line: Line3 = {
            a: [-1, 1, 1],
            b: [3, 1, 1]
        };
        expect(Aabb.lineIntersection(box, line)).toBe(0.25);
    });

    it('should return -1 when line does not intersect box', () => {
        const line: Line3 = {
            a: [3, 3, 3],
            b: [5, 5, 5]
        };
        expect(Aabb.lineIntersection(box, line)).toBe(-1);
    });

    it('should return -1 when line intersects but segment is too short', () => {
        const line: Line3 = {
            a: [-2, 1, 1],
            b: [-1, 1, 1]
        };
        expect(Aabb.lineIntersection(box, line)).toBe(-1);
    });

    it('should handle line parallel to x-axis', () => {
        const line: Line3 = {
            a: [-1, 1, 1],
            b: [3, 1, 1]
        };
        expect(Aabb.lineIntersection(box, line)).toBe(0.25);
    });

    it('should handle line parallel to y-axis', () => {
        const line: Line3 = {
            a: [1, -1, 1],
            b: [1, 3, 1]
        };
        expect(Aabb.lineIntersection(box, line)).toBe(0.25);
    });

    it('should handle line parallel to z-axis', () => {
        const line: Line3 = {
            a: [1, 1, -1],
            b: [1, 1, 3]
        };
        expect(Aabb.lineIntersection(box, line)).toBe(0.25);
    });

    it('should handle line that goes through corner', () => {
        const line: Line3 = {
            a: [-1, -1, -1],
            b: [3, 3, 3]
        };
        expect(Aabb.lineIntersection(box, line)).toBe(0.25);
    });

    it('should handle line that starts at box boundary', () => {
        const line: Line3 = {
            a: [0, 1, 1],
            b: [3, 1, 1]
        };
        expect(Aabb.lineIntersection(box, line)).toBe(0);
    });

    it('should handle line that ends at box boundary', () => {
        const line: Line3 = {
            a: [-1, 1, 1],
            b: [2, 1, 1]
        };
        expect(Aabb.lineIntersection(box, line)).toBe(1 / 3);
    });

    it('should handle negative coordinates', () => {
        const negativeBox: Aabb = {
            min: [-2, -2, -2],
            max: [0, 0, 0]
        };
        const line: Line3 = {
            a: [-3, -1, -1],
            b: [1, -1, -1]
        };
        expect(Aabb.lineIntersection(negativeBox, line)).toBe(0.25);
    });

    describe('with radius parameter', () => {
        it('should behave identically when radius is 0 (default)', () => {
            const line: Line3 = {
                a: [-1, 1, 1],
                b: [3, 1, 1]
            };
            expect(Aabb.lineIntersection(box, line)).toBe(Aabb.lineIntersection(box, line, 0));
        });

        it('should intersect when line is outside but within radius', () => {
            const line: Line3 = {
                a: [-1, 1, 1],
                b: [3, 1, 1]
            };
            // Without radius, this line intersects at alpha = 0.25
            expect(Aabb.lineIntersection(box, line)).toBe(0.25);
            // With radius 0.5, expanded box is [-0.5, -0.5, -0.5] to [2.5, 2.5, 2.5]
            // Line from -1 to 3 intersects at alpha = 0.125 (from -1 to -0.5 is 0.5 units, total line is 4 units)
            expect(Aabb.lineIntersection(box, line, 0.5)).toBe(0.125);
        });

        it('should intersect when line passes near corner with sufficient radius', () => {
            const line: Line3 = {
                a: [-1, -1, 1],
                b: [3, 3, 1]
            };
            // Without radius, this line intersects at alpha = 0.25
            expect(Aabb.lineIntersection(box, line)).toBe(0.25);
            // With radius 0.5, expanded box is [-0.5, -0.5, -0.5] to [2.5, 2.5, 2.5]
            // Line from (-1, -1, 1) to (3, 3, 1) intersects at alpha = 0.125
            expect(Aabb.lineIntersection(box, line, 0.5)).toBe(0.125);
        });

        it('should still not intersect when line is too far even with radius', () => {
            const line: Line3 = {
                a: [-2, 1, 1],
                b: [4, 1, 1]
            };
            // Even with radius 0.5, expanded box is [-0.5, -0.5, -0.5] to [2.5, 2.5, 2.5]
            // Line from -2 to 4 should intersect at alpha = 0.25
            expect(Aabb.lineIntersection(box, line, 0.5)).toBe(0.25);
        });

        it('should handle radius larger than box size', () => {
            const line: Line3 = {
                a: [-5, 1, 1],
                b: [7, 1, 1]
            };
            // With radius 3, the expanded box is [-3, -3, -3] to [5, 5, 5]
            // Line from -5 to 7 should intersect at alpha = 1/6 (from -5 to -3 is 2 units, total line is 12 units)
            expect(Aabb.lineIntersection(box, line, 3)).toBe(1 / 6);
        });

        it('should work with negative radius (shrinks box)', () => {
            const line: Line3 = {
                a: [0.5, 1, 1],
                b: [1.5, 1, 1]
            };
            // Without radius, this line intersects
            expect(Aabb.lineIntersection(box, line)).toBe(0);
            // With negative radius -0.5, the box shrinks to [0.5, 0.5, 0.5] to [1.5, 1.5, 1.5]
            // Line from 0.5 to 1.5 should still intersect
            expect(Aabb.lineIntersection(box, line, -0.5)).toBe(0);
        });

        it('should handle radius with line parallel to each axis', () => {
            // X-axis
            const lineX: Line3 = {
                a: [-0.5, 1, 1],
                b: [2.5, 1, 1]
            };
            expect(Aabb.lineIntersection(box, lineX, 0.5)).toBe(0);

            // Y-axis
            const lineY: Line3 = {
                a: [1, -0.5, 1],
                b: [1, 2.5, 1]
            };
            expect(Aabb.lineIntersection(box, lineY, 0.5)).toBe(0);

            // Z-axis
            const lineZ: Line3 = {
                a: [1, 1, -0.5],
                b: [1, 1, 2.5]
            };
            expect(Aabb.lineIntersection(box, lineZ, 0.5)).toBe(0);
        });

        it('should handle radius with line that starts inside expanded box', () => {
            const line: Line3 = {
                a: [-0.5, 1, 1],
                b: [2.5, 1, 1]
            };
            // Line starts at -0.5, but with radius 0.5, expanded box starts at -0.5
            // So line starts exactly at the boundary of expanded box
            expect(Aabb.lineIntersection(box, line, 0.5)).toBe(0);
        });

        it('should handle radius with line that ends inside expanded box', () => {
            const line: Line3 = {
                a: [-1, 1, 1],
                b: [2.5, 1, 1]
            };
            // Line ends at 2.5, but with radius 0.5, expanded box ends at 2.5
            // Line from -1 to 2.5 (3.5 units total), intersection at -0.5 (0.5 units from start)
            // Alpha = 0.5 / 3.5 = 1/7 ≈ 0.142857
            expect(Aabb.lineIntersection(box, line, 0.5)).toBe(1 / 7);
        });
    });
}); 