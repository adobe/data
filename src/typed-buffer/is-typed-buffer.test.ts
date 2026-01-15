// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from 'vitest';
import { isTypedBuffer } from './is-typed-buffer.js';
import { createNumberBuffer } from './create-number-buffer.js';
import { createArrayBuffer } from './create-array-buffer.js';
import { createStructBuffer } from './create-struct-buffer.js';
import { createTypedBuffer } from './create-typed-buffer.js';

describe('isTypedBuffer', () => {
    it('should return true for createNumberBuffer', () => {
        const buffer = createNumberBuffer({ type: 'number', precision: 1 }, 2);
        expect(isTypedBuffer(buffer)).toBe(true);
    });
    it('should return true for createArrayBuffer', () => {
        const buffer = createArrayBuffer({ type: 'string' }, 2);
        expect(isTypedBuffer(buffer)).toBe(true);
    });
    it('should return true for createStructBuffer', () => {
        const schema = { type: 'object', properties: { x: { type: 'number', precision: 1 } } } as const;
        const buffer = createStructBuffer(schema, 2);
        expect(isTypedBuffer(buffer)).toBe(true);
    });
    it('should return true for createTypedBuffer', () => {
        const buffer = createTypedBuffer({ type: 'number', precision: 1 }, 2);
        expect(isTypedBuffer(buffer)).toBe(true);
    });
}); 