// © 2026 Adobe. MIT License. See /LICENSE for details.

import { equalsShallow } from './equals-shallow.js';
import { describe, expect, it } from 'vitest';

describe('equalsShallow', () => {
  describe('primitives and identical refs', () => {
    it('should return true for identical primitive values', () => {
      expect(equalsShallow(1, 1)).toBe(true);
      expect(equalsShallow('hello', 'hello')).toBe(true);
      expect(equalsShallow(true, true)).toBe(true);
      expect(equalsShallow(false, false)).toBe(true);
      expect(equalsShallow(undefined, undefined)).toBe(true);
      expect(equalsShallow(null, null)).toBe(true);
    });

    it('should return true for identical object references', () => {
      const obj = { a: 1 };
      expect(equalsShallow(obj, obj)).toBe(true);

      const arr = [1, 2, 3];
      expect(equalsShallow(arr, arr)).toBe(true);
    });

    it('should return false for different primitive values', () => {
      expect(equalsShallow(1, 2)).toBe(false);
      expect(equalsShallow('hello', 'world')).toBe(false);
      expect(equalsShallow(true, false)).toBe(false);
      expect(equalsShallow(1, '1')).toBe(false);
    });
  });

  describe('null and non-objects', () => {
    it('should return false when one is null and other is not', () => {
      expect(equalsShallow(null, {})).toBe(false);
      expect(equalsShallow({}, null)).toBe(false);
      expect(equalsShallow(null, [])).toBe(false);
      expect(equalsShallow([], null)).toBe(false);
    });

    it('should return false when one is not an object', () => {
      expect(equalsShallow(1, {})).toBe(false);
      expect(equalsShallow({}, 1)).toBe(false);
      expect(equalsShallow('string', [])).toBe(false);
      expect(equalsShallow([], 'string')).toBe(false);
    });
  });

  describe('arrays', () => {
    it('should return true for identical arrays', () => {
      expect(equalsShallow([1, 2, 3], [1, 2, 3])).toBe(true);
      expect(equalsShallow(['a', 'b'], ['a', 'b'])).toBe(true);
      expect(equalsShallow([], [])).toBe(true);
    });

    it('should return false when one is array and other is not', () => {
      expect(equalsShallow([1, 2, 3], {})).toBe(false);
      expect(equalsShallow({}, [1, 2, 3])).toBe(false);
    });

    it('should return false for arrays with different lengths', () => {
      expect(equalsShallow([1, 2], [1, 2, 3])).toBe(false);
      expect(equalsShallow([1, 2, 3], [1, 2])).toBe(false);
    });

    it('should return false for arrays with different elements', () => {
      expect(equalsShallow([1, 2, 3], [1, 2, 4])).toBe(false);
      expect(equalsShallow([1, 2, 3], [1, 3, 2])).toBe(false);
    });

    it('should handle nested objects in arrays (shallow comparison)', () => {
      const obj1 = { a: 1 };
      const obj2 = { a: 1 };
      expect(equalsShallow([obj1], [obj1])).toBe(true);
      expect(equalsShallow([obj1], [obj2])).toBe(false); // Different references
    });
  });

  describe('plain objects', () => {
    it('should return true for identical objects', () => {
      expect(equalsShallow({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
      expect(equalsShallow({}, {})).toBe(true);
    });

    it('should return false for objects with different values', () => {
      expect(equalsShallow({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
      expect(equalsShallow({ a: 1 }, { a: 2 })).toBe(false);
    });

    it('should return false for objects with different keys', () => {
      expect(equalsShallow({ a: 1, b: 2 }, { a: 1, c: 2 })).toBe(false);
      expect(equalsShallow({ a: 1 }, { b: 1 })).toBe(false);
    });

    it('should return false when one object has extra keys', () => {
      expect(equalsShallow({ a: 1 }, { a: 1, b: 2 })).toBe(false);
      expect(equalsShallow({ a: 1, b: 2 }, { a: 1 })).toBe(false);
    });

    it('should handle nested objects (shallow comparison)', () => {
      const nested1 = { x: 1 };
      const nested2 = { x: 1 };
      expect(equalsShallow({ a: nested1 }, { a: nested1 })).toBe(true);
      expect(equalsShallow({ a: nested1 }, { a: nested2 })).toBe(false); // Different references
    });

    it('should handle arrays as object values (shallow comparison)', () => {
      const arr1 = [1, 2, 3];
      const arr2 = [1, 2, 3];
      expect(equalsShallow({ a: arr1 }, { a: arr1 })).toBe(true);
      expect(equalsShallow({ a: arr1 }, { a: arr2 })).toBe(false); // Different references
    });
  });

  describe('edge cases', () => {
    it('should handle objects with same keys but different order', () => {
      expect(equalsShallow({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    });

    it('should handle objects with undefined values', () => {
      expect(equalsShallow({ a: undefined }, { a: undefined })).toBe(true);
      expect(equalsShallow({ a: undefined }, { a: 1 })).toBe(false);
    });

    it('should handle objects with null values', () => {
      expect(equalsShallow({ a: null }, { a: null })).toBe(true);
      expect(equalsShallow({ a: null }, { a: 1 })).toBe(false);
    });

    it('should handle mixed types in arrays', () => {
      expect(equalsShallow([1, 'string', true], [1, 'string', true])).toBe(true);
      expect(equalsShallow([1, 'string', true], [1, 'string', false])).toBe(false);
    });
  });
}); 