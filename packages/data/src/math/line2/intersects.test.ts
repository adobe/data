// © 2026 Adobe. MIT License. See /LICENSE for details.


import { describe, it, expect } from 'vitest';
import { Line2 } from '../index.js';

describe('Line2.intersects', () => {
    it('should return true for intersecting lines', () => {
        const line1: Line2 = {
            a: [0, 0],
            b: [2, 2]
        };
        const line2: Line2 = {
            a: [0, 2],
            b: [2, 0]
        };
        expect(Line2.intersects(line1, line2)).toBe(true);
    });

    it('should return false for parallel lines', () => {
        const line1: Line2 = {
            a: [0, 0],
            b: [2, 2]
        };
        const line2: Line2 = {
            a: [0, 1],
            b: [2, 3]
        };
        expect(Line2.intersects(line1, line2)).toBe(false);
    });

    it('should return false for non-intersecting lines', () => {
        const line1: Line2 = {
            a: [0, 0],
            b: [2, 2]
        };
        const line2: Line2 = {
            a: [3, 0],
            b: [5, 2]
        };
        expect(Line2.intersects(line1, line2)).toBe(false);
    });

    it('should return true for lines that intersect at endpoints', () => {
        const line1: Line2 = {
            a: [0, 0],
            b: [2, 2]
        };
        const line2: Line2 = {
            a: [2, 2],
            b: [4, 4]
        };
        expect(Line2.intersects(line1, line2, false)).toBe(false);
        expect(Line2.intersects(line1, line2, true)).toBe(true);
    });

    it('should return false for collinear lines that do not overlap', () => {
        const line1: Line2 = {
            a: [0, 0],
            b: [2, 2]
        };
        const line2: Line2 = {
            a: [3, 3],
            b: [5, 5]
        };
        expect(Line2.intersects(line1, line2)).toBe(false);
    });

    it('should handle vertical and horizontal lines', () => {
        const vertical: Line2 = {
            a: [1, 0],
            b: [1, 2]
        };
        const horizontal: Line2 = {
            a: [0, 1],
            b: [2, 1]
        };
        expect(Line2.intersects(vertical, horizontal)).toBe(true);
    });

    it('should handle lines with negative coordinates', () => {
        const line1: Line2 = {
            a: [-2, -2],
            b: [2, 2]
        };
        const line2: Line2 = {
            a: [-2, 2],
            b: [2, -2]
        };
        expect(Line2.intersects(line1, line2)).toBe(true);
    });
}); 