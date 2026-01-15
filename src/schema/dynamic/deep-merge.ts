// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Data } from '../../index.js';

/**
 * Recursively merges 2 pieces of `Data`, returns new `Data`.
 * Inputs are not mutated.
 * 
 * @param {Data} a First piece of `Data`.
 * @param {Data} b The second piece of `Data`.
 * @returns {Object} Returns new `Data`.
 * @example
 *
 * const one = {
 *   'a': [{ 'b': 2 }, { 'd': 4 }]
 * };
 *
 * const other = {
 *   'a': [{ 'c': 3 }, { 'e': 5 }]
 * };
 *
 * deepMerge(one, other);
 * // => { 'a': [{ 'b': 2, 'c': 3 }, { 'd': 4, 'e': 5 }] }
 */
export const deepMerge = <A, B>(a: A, b: B, options: { mergeArrays?: boolean } = {}): A & B => {
  const { mergeArrays = true } = options;
  // Handle null/undefined cases
  if (a == null || typeof a !== 'object' || typeof b !== 'object') return b as A & B;

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (mergeArrays) {
      return [...a, ...b] as unknown as A & B;
    } else {
      return b as A & B;
    }
  }

  // Handle objects
  const result = { ...a } as Record<string, Data>;
  for (const key in b) {
    if (Object.prototype.hasOwnProperty.call(b, key)) {
      const value = (b as Record<string, Data>)[key];
      result[key] = deepMerge((a as Record<string, Data>)[key], value, options);
    }
  }
  return result as A & B;
};