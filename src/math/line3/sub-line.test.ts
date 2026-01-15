// © 2026 Adobe. MIT License. See /LICENSE for details.


import { describe, it, expect } from 'vitest';
import { Line3 } from '../index.js';

describe('Line3.subLine', () => {
    it('should create a sub-line from alpha=0 to beta=1', () => {
        const line: Line3 = {
            a: [0, 0, 0],
            b: [2, 4, 6]
        };
        const result = Line3.subLine(line, 0, 1);
        expect(result).toEqual({
            a: [0, 0, 0],
            b: [2, 4, 6]
        });
    });

    it('should create a sub-line from alpha=0.25 to beta=0.75', () => {
        const line: Line3 = {
            a: [0, 0, 0],
            b: [4, 8, 12]
        };
        const result = Line3.subLine(line, 0.25, 0.75);
        expect(result).toEqual({
            a: [1, 2, 3],
            b: [3, 6, 9]
        });
    });

    it('should create a sub-line with reversed alpha and beta', () => {
        const line: Line3 = {
            a: [0, 0, 0],
            b: [2, 4, 6]
        };
        const result = Line3.subLine(line, 0.75, 0.25);
        expect(result).toEqual({
            a: [1.5, 3, 4.5],
            b: [0.5, 1, 1.5]
        });
    });

    it('should handle negative coordinates', () => {
        const line: Line3 = {
            a: [-2, -4, -6],
            b: [2, 4, 6]
        };
        const result = Line3.subLine(line, 0.25, 0.75);
        expect(result).toEqual({
            a: [-1, -2, -3],
            b: [1, 2, 3]
        });
    });
}); 