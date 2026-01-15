// © 2026 Adobe. MIT License. See /LICENSE for details.
import { deepMerge } from './deep-merge.js';
import { assert } from 'riteway/vitest';
import { describe, test } from 'vitest';

describe('deepMerge', () => {
  test('should merge two objects', () => {
    const a = { a: 1, b: 2 };
    const b = { c: 3, d: 4 };
    assert({
      given: 'two objects without overlapping keys',
      should: 'merge them',
      actual: deepMerge(a, b),
      expected: { a: 1, b: 2, c: 3, d: 4 },
    });
  });

  test('should merge two objects with overlapping keys', () => {
    const a = { a: 1, b: 2 };
    const b = { b: 3, c: 4 };
    assert({
      given: 'two objects with overlapping keys',
      should: 'merge them',
      actual: deepMerge(a, b),
      expected: { a: 1, b: 3, c: 4 },
    });
  });

  test('should merge two objects with overlapping keys and arrays', () => {
    const a = { a: 1, b: [1, 2] };
    const b = { b: [3, 4], c: 4 };
    assert({
      given: 'two objects with overlapping keys and arrays',
      should: 'merge them',
      actual: deepMerge(a, b),
      expected: { a: 1, b: [1, 2, 3, 4], c: 4 },
    });
  });

  test('should merge two nested objects with overlapping keys', () => {
    const a = { a: 1, b: { c: 2, d: 3 } };
    const b = { b: { d: 4, e: 5 }, c: 6 };
    assert({
      given: 'two nested objects with overlapping keys',
      should: 'merge them',
      actual: deepMerge(a, b),
      expected: { a: 1, b: { c: 2, d: 4, e: 5 }, c: 6 },
    });
  });

  test('should merge two objects with null values', () => {
    const a = { a: null, b: 2 };
    const b = { b: null, c: 4 };
    assert({
      given: 'two objects with null values',
      should: 'merge them',
      actual: deepMerge(a, b),
      expected: { a: null, b: null, c: 4 },
    });
  });

  test('should merge two objects with undefined values', () => {
    const a = { a: undefined, b: 2 };
    const b = { b: undefined, c: 4 };
    assert({
      given: 'two objects with undefined values',
      should: 'merge them',
      actual: deepMerge(a, b),
      expected: { a: undefined, b: undefined, c: 4 },
    });
  });

  test('should not mutate the original objects', () => {
    const a = { a: 1, b: 2 };
    const b = { b: 3, c: 4 };
    deepMerge(a, b);
    assert({ given: 'the original objects', should: 'not be mutated', actual: a, expected: { a: 1, b: 2 } });
    assert({ given: 'the original objects', should: 'not be mutated', actual: b, expected: { b: 3, c: 4 } });
  });
});
