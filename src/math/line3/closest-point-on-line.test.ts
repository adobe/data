// © 2026 Adobe. MIT License. See /LICENSE for details.


import { describe, it, expect } from 'vitest';
import { Line3, Vec3 } from '../index.js';

describe('Line3.closestPointOnLine', () => {
    const line: Line3 = {
        a: [0, 0, 0],
        b: [2, 0, 0]
    };

    it('should return 0 when point is closest to line start', () => {
        const point: Vec3 = [0, 0, 0]; // Point exactly at line start
        expect(Line3.closestPointOnLine(line, point)).toBe(0);
    });

    it('should return 1 when point is closest to line end', () => {
        const point: Vec3 = [2, 0, 0]; // Point exactly at line end
        expect(Line3.closestPointOnLine(line, point)).toBe(1);
    });

    it('should return negative alpha when point is before line start', () => {
        const point: Vec3 = [-1, 0, 0];
        expect(Line3.closestPointOnLine(line, point)).toBe(-0.5); // alpha = (-1-0)/(2-0) = -0.5
    });

    it('should return alpha > 1 when point is beyond line end', () => {
        const point: Vec3 = [3, 0, 0];
        expect(Line3.closestPointOnLine(line, point)).toBe(1.5); // alpha = (3-0)/(2-0) = 1.5
    });

    it('should return 0.5 when point is closest to line middle', () => {
        const point: Vec3 = [1, 0, 0];
        expect(Line3.closestPointOnLine(line, point)).toBe(0.5);
    });

    it('should return 0.25 when point is closest to quarter way along line', () => {
        const point: Vec3 = [0.5, 0, 0];
        expect(Line3.closestPointOnLine(line, point)).toBe(0.25);
    });

    it('should return 0.75 when point is closest to three quarters way along line', () => {
        const point: Vec3 = [1.5, 0, 0];
        expect(Line3.closestPointOnLine(line, point)).toBe(0.75);
    });

    it('should handle points perpendicular to line', () => {
        const point: Vec3 = [1, 5, 0];
        expect(Line3.closestPointOnLine(line, point)).toBe(0.5);
    });

    it('should handle points with z offset', () => {
        const point: Vec3 = [1, 0, 10];
        expect(Line3.closestPointOnLine(line, point)).toBe(0.5);
    });

    it('should handle diagonal line', () => {
        const diagonalLine: Line3 = {
            a: [0, 0, 0],
            b: [2, 2, 0]
        };
        const point: Vec3 = [1, 1, 0];
        expect(Line3.closestPointOnLine(diagonalLine, point)).toBe(0.5);
    });

    it('should handle zero-length line', () => {
        const zeroLine: Line3 = {
            a: [1, 1, 1],
            b: [1, 1, 1]
        };
        const point: Vec3 = [0, 0, 0];
        expect(Line3.closestPointOnLine(zeroLine, point)).toBe(0);
    });

    it('should not clamp alpha to [0, 1] range', () => {
        const point: Vec3 = [5, 0, 0];
        expect(Line3.closestPointOnLine(line, point)).toBe(2.5); // alpha = (5-0)/(2-0) = 2.5

        const point2: Vec3 = [-5, 0, 0];
        expect(Line3.closestPointOnLine(line, point2)).toBe(-2.5); // alpha = (-5-0)/(2-0) = -2.5
    });

    it('should prefer lower alpha when distances are equal', () => {
        // Two points at equal distance from the line but different alpha values
        const point1: Vec3 = [0.5, 2, 0]; // alpha = 0.25, distance = 2
        const point2: Vec3 = [1.5, 2, 0]; // alpha = 0.75, distance = 2

        const alpha1 = Line3.closestPointOnLine(line, point1);
        const alpha2 = Line3.closestPointOnLine(line, point2);

        expect(alpha1).toBe(0.25);
        expect(alpha2).toBe(0.75);

        // The tie-breaking logic in getClosestRowToLine should prefer point1 (lower alpha)
        // when both have the same distance to the line
    });

    it('should handle points beyond line end with unclamped alpha', () => {
        const point: Vec3 = [10, 0, 0];
        expect(Line3.closestPointOnLine(line, point)).toBe(5); // alpha = (10-0)/(2-0) = 5
    });

    it('should handle points before line start with unclamped alpha', () => {
        const point: Vec3 = [-10, 0, 0];
        expect(Line3.closestPointOnLine(line, point)).toBe(-5); // alpha = (-10-0)/(2-0) = -5
    });
}); 