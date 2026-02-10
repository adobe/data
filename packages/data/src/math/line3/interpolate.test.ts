// © 2026 Adobe. MIT License. See /LICENSE for details.


import { describe, it, expect } from 'vitest';
import { Line3 } from '../index.js';

describe('Line3.interpolate', () => {
    it('should Line3.interpolate at alpha = 0', () => {
        const line: Line3 = {
            a: [0, 0, 0],
            b: [2, 4, 6]
        };
        const result = Line3.interpolate(line, 0);
        expect(result).toEqual([0, 0, 0]);
    });

    it('should Line3.interpolate at alpha = 1', () => {
        const line: Line3 = {
            a: [0, 0, 0],
            b: [2, 4, 6]
        };
        const result = Line3.interpolate(line, 1);
        expect(result).toEqual([2, 4, 6]);
    });

    it('should Line3.interpolate at alpha = 0.5', () => {
        const line: Line3 = {
            a: [0, 0, 0],
            b: [2, 4, 6]
        };
        const result = Line3.interpolate(line, 0.5);
        expect(result).toEqual([1, 2, 3]);
    });

    it('should Line3.interpolate with negative coordinates', () => {
        const line: Line3 = {
            a: [-2, -4, -6],
            b: [2, 4, 6]
        };
        const result = Line3.interpolate(line, 0.5);
        expect(result).toEqual([0, 0, 0]);
    });

    it('should Line3.interpolate with fractional alpha', () => {
        const line: Line3 = {
            a: [0, 0, 0],
            b: [10, 20, 30]
        };
        const result = Line3.interpolate(line, 0.3);
        expect(result).toEqual([3, 6, 9]);
    });
}); 