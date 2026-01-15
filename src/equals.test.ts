// © 2026 Adobe. MIT License. See /LICENSE for details.

import { equals } from './equals.js';
import { describe, expect, it } from 'vitest';
import { createNumberBuffer } from './typed-buffer/create-number-buffer.js';
import { createArrayBuffer } from './typed-buffer/create-array-buffer.js';
import { createStructBuffer } from './typed-buffer/create-struct-buffer.js';
import { createConstBuffer } from './typed-buffer/create-const-buffer.js';

describe('equals', () => {
  describe('primitives and identical references', () => {
    it('should return true for identical primitive values', () => {
      expect(equals(42, 42)).toBe(true);
      expect(equals('hello', 'hello')).toBe(true);
      expect(equals(true, true)).toBe(true);
      expect(equals(false, false)).toBe(true);
    });

    it('should return true for identical object references', () => {
      const obj = { a: 1 };
      expect(equals(obj, obj)).toBe(true);
    });

    it('should return false for different primitive values', () => {
      expect(equals(42, 43)).toBe(false);
      expect(equals('hello', 'world')).toBe(false);
      expect(equals(true, false)).toBe(false);
    });
  });

  describe('null and undefined handling', () => {
    it('should return false when one value is null and other is not', () => {
      expect(equals(null, 42)).toBe(false);
      expect(equals(42, null)).toBe(false);
      expect(equals(null, 'hello')).toBe(false);
      expect(equals('hello', null)).toBe(false);
    });

    it('should return false when one value is undefined and other is not', () => {
      expect(equals(undefined, 42)).toBe(false);
      expect(equals(42, undefined)).toBe(false);
      expect(equals(undefined, 'hello')).toBe(false);
      expect(equals('hello', undefined)).toBe(false);
    });

    it('should return false when one is null and other is undefined', () => {
      expect(equals(null, undefined)).toBe(false);
      expect(equals(undefined, null)).toBe(false);
    });
  });

  describe('type mismatch handling', () => {
    it('should return false when one is primitive and other is object', () => {
      expect(equals(42, {})).toBe(false);
      expect(equals({}, 42)).toBe(false);
      expect(equals('hello', [])).toBe(false);
      expect(equals([], 'hello')).toBe(false);
    });
  });

  describe('arrays', () => {
    it('should return true for identical arrays', () => {
      expect(equals([1, 2, 3], [1, 2, 3])).toBe(true);
      expect(equals(['a', 'b'], ['a', 'b'])).toBe(true);
      expect(equals([], [])).toBe(true);
    });

    it('should return false when one is array and other is object', () => {
      expect(equals([1, 2, 3], { 0: 1, 1: 2, 2: 3 })).toBe(false);
      expect(equals({ 0: 1, 1: 2, 2: 3 }, [1, 2, 3])).toBe(false);
    });

    it('should return false for arrays with different lengths', () => {
      expect(equals([1, 2], [1, 2, 3])).toBe(false);
      expect(equals([1, 2, 3], [1, 2])).toBe(false);
    });

    it('should return false for arrays with different values', () => {
      expect(equals([1, 2, 3], [1, 2, 4])).toBe(false);
      expect(equals([1, 2, 3], [1, 3, 2])).toBe(false);
    });

    it('should handle nested arrays', () => {
      expect(equals([[1, 2], [3, 4]], [[1, 2], [3, 4]])).toBe(true);
      expect(equals([[1, 2], [3, 4]], [[1, 2], [3, 5]])).toBe(false);
    });

    it('should handle arrays with mixed content', () => {
      expect(equals([1, 'hello', { a: 1 }], [1, 'hello', { a: 1 }])).toBe(true);
      expect(equals([1, 'hello', { a: 1 }], [1, 'hello', { a: 2 }])).toBe(false);
    });
  });

  describe('objects', () => {
    it('should return true for identical objects', () => {
      expect(equals({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
      expect(equals({}, {})).toBe(true);
    });

    it('should return false for objects with different keys', () => {
      expect(equals({ a: 1 }, { b: 1 })).toBe(false);
      expect(equals({ a: 1, b: 2 }, { a: 1 })).toBe(false);
      expect(equals({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    });

    it('should return false for objects with same keys but different values', () => {
      expect(equals({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
      expect(equals({ a: 1 }, { a: 2 })).toBe(false);
    });

    it('should handle nested objects', () => {
      expect(equals({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
      expect(equals({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
    });

    it('should handle objects with arrays', () => {
      expect(equals({ a: [1, 2] }, { a: [1, 2] })).toBe(true);
      expect(equals({ a: [1, 2] }, { a: [1, 3] })).toBe(false);
    });

    it('should handle complex nested structures', () => {
      const obj1 = { a: [1, { b: 2, c: [3, 4] }], d: { e: 5 } };
      const obj2 = { a: [1, { b: 2, c: [3, 4] }], d: { e: 5 } };
      const obj3 = { a: [1, { b: 2, c: [3, 5] }], d: { e: 5 } };
      
      expect(equals(obj1, obj2)).toBe(true);
      expect(equals(obj1, obj3)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle objects with numeric keys', () => {
      expect(equals({ '0': 1, '1': 2 }, { '0': 1, '1': 2 })).toBe(true);
      expect(equals({ '0': 1, '1': 2 }, { '0': 1, '1': 3 })).toBe(false);
    });

    it('should handle empty arrays and objects', () => {
      expect(equals([], [])).toBe(true);
      expect(equals({}, {})).toBe(true);
      expect(equals([], {})).toBe(false);
    });

    it('should handle objects with undefined values', () => {
      expect(equals({ a: undefined }, { a: undefined })).toBe(true);
      expect(equals({ a: undefined }, { a: null })).toBe(false);
    });

    it('should handle objects with null values', () => {
      expect(equals({ a: null }, { a: null })).toBe(true);
      expect(equals({ a: null }, { a: undefined })).toBe(false);
    });

    it('should handle NaN values', () => {
      expect(equals(NaN, NaN)).toBe(true);
      expect(equals(NaN, 42)).toBe(false);
      expect(equals(42, NaN)).toBe(false);
    });
  });

  describe('typed buffers', () => {
    it('should return true for identical number buffers', () => {
      const buffer1 = createNumberBuffer({ type: 'number', precision: 1 }, 3);
      const buffer2 = createNumberBuffer({ type: 'number', precision: 1 }, 3);
      
      buffer1.set(0, 1.5);
      buffer1.set(1, 2.5);
      buffer1.set(2, 3.5);
      
      buffer2.set(0, 1.5);
      buffer2.set(1, 2.5);
      buffer2.set(2, 3.5);
      
      expect(equals(buffer1, buffer2)).toBe(true);
    });

    it('should return false for different typed buffers', () => {
      const buffer1 = createNumberBuffer({ type: 'number', precision: 1 }, 2);
      const buffer2 = createNumberBuffer({ type: 'number', precision: 1 }, 2);
      
      buffer1.set(0, 1.5);
      buffer1.set(1, 2.5);
      
      buffer2.set(0, 1.5);
      buffer2.set(1, 3.5); // Different value
      
      expect(equals(buffer1, buffer2)).toBe(false);
    });

    it('should return false when comparing typed buffer with non-typed buffer', () => {
      const buffer = createNumberBuffer({ type: 'number', precision: 1 }, 2);
      const array = [1.5, 2.5];
      
      expect(equals(buffer, array)).toBe(false);
      expect(equals(array, buffer)).toBe(false);
    });

    it('should handle different typed buffer types', () => {
      const numberBuffer = createNumberBuffer({ type: 'number', precision: 1 }, 2);
      const arrayBuffer = createArrayBuffer({ type: 'string' }, 2);
      
      numberBuffer.set(0, 1);
      numberBuffer.set(1, 2);
      
      arrayBuffer.set(0, '1');
      arrayBuffer.set(1, '2');
      
      expect(equals(numberBuffer, arrayBuffer)).toBe(false);
    });

    it('should handle const buffers', () => {
      const buffer1 = createConstBuffer({ const: 42 }, 3);
      const buffer2 = createConstBuffer({ const: 42 }, 3);
      const buffer3 = createConstBuffer({ const: 43 }, 3);
      
      expect(equals(buffer1, buffer2)).toBe(true);
      expect(equals(buffer1, buffer3)).toBe(false);
    });
  });
}); 