// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from 'vitest';
import { Aabb } from '../index.js';

const Face = Aabb.Face;

describe('Aabb.Face', () => {
    it('should get correct opposite faces', () => {
        expect(Face.getOpposite(Face.POS_Z)).toBe(Face.NEG_Z);
        expect(Face.getOpposite(Face.POS_X)).toBe(Face.NEG_X);
        expect(Face.getOpposite(Face.POS_Y)).toBe(Face.NEG_Y);
    });

    it('should get correct adjacent faces for each axis', () => {
        const posZAdjacent = Face.getAdjacent(Face.POS_Z);
        expect(posZAdjacent).toEqual([Face.POS_X, Face.NEG_X, Face.POS_Y, Face.NEG_Y]);
        
        const posXAdjacent = Face.getAdjacent(Face.POS_X);
        expect(posXAdjacent).toEqual([Face.POS_Z, Face.NEG_Z, Face.POS_Y, Face.NEG_Y]);
        
        const posYAdjacent = Face.getAdjacent(Face.POS_Y);
        expect(posYAdjacent).toEqual([Face.POS_Z, Face.NEG_Z, Face.POS_X, Face.NEG_X]);
    });

    it('should throw error for invalid face indices', () => {
        expect(() => Face.getNormal(6 as any)).toThrow('Invalid face index: 6');
        expect(() => Face.getOpposite(6 as any)).toThrow('Invalid face index: 6');
        expect(() => Face.getAdjacent(6 as any)).toThrow('Invalid face index: 6');
    });

    it('should determine face from position correctly', () => {
        const aabb = { min: [-1, -1, -1] as const, max: [1, 1, 1] as const }; // Unit cube centered at origin
        
        // Test positions on each face
        expect(Face.fromPosition([1, 0, 0], aabb)).toBe(Face.POS_X);
        expect(Face.fromPosition([-1, 0, 0], aabb)).toBe(Face.NEG_X);
        expect(Face.fromPosition([0, 1, 0], aabb)).toBe(Face.POS_Y);
        expect(Face.fromPosition([0, -1, 0], aabb)).toBe(Face.NEG_Y);
        expect(Face.fromPosition([0, 0, 1], aabb)).toBe(Face.POS_Z);
        expect(Face.fromPosition([0, 0, -1], aabb)).toBe(Face.NEG_Z);
    });
});
