// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from 'vitest';
import { createTypedBuffer } from './create-typed-buffer.js';
import { createNumberBuffer, numberBufferType } from './create-number-buffer.js';
import { arrayBufferType, createArrayBuffer } from './create-array-buffer.js';
import { createStructBuffer, structBufferType } from './create-struct-buffer.js';
import { isTypedBuffer } from './is-typed-buffer.js';

describe('TypedBuffer copyWithin', () => {
    describe('NumberBuffer', () => {
        it('should copy elements within the same buffer', () => {
            const buffer = createNumberBuffer({ type: 'number', precision: 1 }, 5);

            // Initialize with values
            for (let i = 0; i < 5; i++) {
                buffer.set(i, i + 1);
            }

            // Copy elements 0-2 to position 2
            buffer.copyWithin(2, 0, 3);
            expect(buffer.get(0)).toBe(1);
            expect(buffer.get(1)).toBe(2);
            expect(buffer.get(2)).toBe(1);
            expect(buffer.get(3)).toBe(2);
            expect(buffer.get(4)).toBe(3);
        });

        it('should handle negative indices', () => {
            const buffer = createNumberBuffer({ type: 'number', precision: 1 }, 5);

            // Initialize with values
            for (let i = 0; i < 5; i++) {
                buffer.set(i, i + 1);
            }

            // Copy last 2 elements to start (from index -2 to end of array)
            buffer.copyWithin(0, -2, buffer.capacity);
            expect(buffer.get(0)).toBe(4);
            expect(buffer.get(1)).toBe(5);
            expect(buffer.get(2)).toBe(3);
            expect(buffer.get(3)).toBe(4);
            expect(buffer.get(4)).toBe(5);
        });

        it('should handle out of bounds indices', () => {
            const buffer = createNumberBuffer({ type: 'number', precision: 1 }, 5);

            // Initialize with values
            for (let i = 0; i < 5; i++) {
                buffer.set(i, i + 1);
            }

            // Copy with out of bounds target
            buffer.copyWithin(10, 0, 2);
            expect(buffer.get(0)).toBe(1);
            expect(buffer.get(1)).toBe(2);
            expect(buffer.get(2)).toBe(3);
            expect(buffer.get(3)).toBe(4);
            expect(buffer.get(4)).toBe(5);
        });
    });

    describe('ArrayBuffer', () => {
        it('should copy elements within the same buffer', () => {
            const buffer = createArrayBuffer({ type: 'string' }, 5);

            // Initialize with values
            for (let i = 0; i < 5; i++) {
                buffer.set(i, `value${i + 1}`);
            }

            // Copy elements 0-2 to position 2
            buffer.copyWithin(2, 0, 3);
            expect(buffer.get(0)).toBe('value1');
            expect(buffer.get(1)).toBe('value2');
            expect(buffer.get(2)).toBe('value1');
            expect(buffer.get(3)).toBe('value2');
            expect(buffer.get(4)).toBe('value3');
        });

        it('should handle negative indices', () => {
            const buffer = createArrayBuffer({ type: 'string' }, 5);


            // Initialize with values
            for (let i = 0; i < 5; i++) {
                buffer.set(i, `value${i + 1}`);
            }

            // Copy last 2 elements to start (from index -2 to end of array)
            buffer.copyWithin(0, -2, buffer.capacity);
            expect(buffer.get(0)).toBe('value4');
            expect(buffer.get(1)).toBe('value5');
            expect(buffer.get(2)).toBe('value3');
            expect(buffer.get(3)).toBe('value4');
            expect(buffer.get(4)).toBe('value5');
        });

        it('should handle out of bounds indices', () => {
            const buffer = createArrayBuffer({ type: 'string' }, 5);


            // Initialize with values
            for (let i = 0; i < 5; i++) {
                buffer.set(i, `value${i + 1}`);
            }

            // Copy with out of bounds target
            buffer.copyWithin(10, 0, 2);
            expect(buffer.get(0)).toBe('value1');
            expect(buffer.get(1)).toBe('value2');
            expect(buffer.get(2)).toBe('value3');
            expect(buffer.get(3)).toBe('value4');
            expect(buffer.get(4)).toBe('value5');
        });
    });

    describe('StructBuffer', () => {
        const vec2Schema = {
            type: 'object',
            properties: {
                x: { type: 'number', precision: 1 },
                y: { type: 'number', precision: 1 }
            }
        } as const;

        it('should copy elements within the same buffer', () => {
            const buffer = createStructBuffer(vec2Schema, 5);

            // Initialize with values
            for (let i = 0; i < 5; i++) {
                buffer.set(i, { x: i + 1, y: i + 2 });
            }

            // Copy elements 0-2 to position 2
            buffer.copyWithin(2, 0, 3);
            expect(buffer.get(0)).toEqual({ x: 1, y: 2 });
            expect(buffer.get(1)).toEqual({ x: 2, y: 3 });
            expect(buffer.get(2)).toEqual({ x: 1, y: 2 });
            expect(buffer.get(3)).toEqual({ x: 2, y: 3 });
            expect(buffer.get(4)).toEqual({ x: 3, y: 4 });
        });

        it('should handle negative indices', () => {
            const buffer = createStructBuffer(vec2Schema, 5);


            // Initialize with values
            for (let i = 0; i < 5; i++) {
                buffer.set(i, { x: i + 1, y: i + 2 });
            }

            // Copy last 2 elements to start (from index -2 to end of array)
            buffer.copyWithin(0, -2, buffer.capacity);
            expect(buffer.get(0)).toEqual({ x: 4, y: 5 });
            expect(buffer.get(1)).toEqual({ x: 5, y: 6 });
            expect(buffer.get(2)).toEqual({ x: 3, y: 4 });
            expect(buffer.get(3)).toEqual({ x: 4, y: 5 });
            expect(buffer.get(4)).toEqual({ x: 5, y: 6 });
        });

        it('should handle out of bounds indices', () => {
            const buffer = createStructBuffer(vec2Schema, 5);

            // Initialize with values
            for (let i = 0; i < 5; i++) {
                buffer.set(i, { x: i + 1, y: i + 2 });
            }

            // Copy with out of bounds target
            buffer.copyWithin(10, 0, 2);
            expect(buffer.get(0)).toEqual({ x: 1, y: 2 });
            expect(buffer.get(1)).toEqual({ x: 2, y: 3 });
            expect(buffer.get(2)).toEqual({ x: 3, y: 4 });
            expect(buffer.get(3)).toEqual({ x: 4, y: 5 });
            expect(buffer.get(4)).toEqual({ x: 5, y: 6 });
        });
    });

    describe('createTypedBuffer', () => {
        it('should create appropriate buffer type and handle copyWithin', () => {
            // Test number buffer
            const numberBuffer = createTypedBuffer({ type: 'number', precision: 1 });
            expect(numberBuffer.type).toBe(numberBufferType);
            numberBuffer.set(0, 1);
            numberBuffer.set(1, 2);
            numberBuffer.copyWithin(2, 0, 2);
            expect(numberBuffer.get(2)).toBe(1);
            expect(numberBuffer.get(3)).toBe(2);

            // Test array buffer
            const arrayBuffer = createTypedBuffer({ type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 } as const);
            expect(arrayBuffer.type).toBe(arrayBufferType);
            arrayBuffer.set(0, ['a', 'b']);
            arrayBuffer.set(1, ['c', 'd']);
            arrayBuffer.copyWithin(2, 0, 2);
            expect(arrayBuffer.get(2)).toEqual(['a', 'b']);
            expect(arrayBuffer.get(3)).toEqual(['c', 'd']);

            // Test struct buffer
            const structBuffer = createTypedBuffer({
                type: 'object',
                properties: {
                    x: { type: 'number', precision: 1 },
                    y: { type: 'number', precision: 1 }
                }
            });
            expect(structBuffer.type).toBe(structBufferType);
            structBuffer.set(0, { x: 1, y: 2 });
            structBuffer.set(1, { x: 3, y: 4 });
            structBuffer.copyWithin(2, 0, 2);
            expect(structBuffer.get(2)).toEqual({ x: 1, y: 2 });
            expect(structBuffer.get(3)).toEqual({ x: 3, y: 4 });
        });
    });
});

describe('TypedBuffer slice', () => {
    describe('NumberBuffer', () => {
        it('should support full slice', () => {
            const buffer = createNumberBuffer({ type: 'number', precision: 1 }, 5);

            // Initialize with values
            for (let i = 0; i < 5; i++) {
                buffer.set(i, i + 1);
            }

            const values = Array.from(buffer.slice());
            expect(values).toEqual([1, 2, 3, 4, 5]);
        });

        it('should support partial slicing', () => {
            const buffer = createNumberBuffer({ type: 'number', precision: 1 }, 5);

            // Initialize with values
            for (let i = 0; i < 5; i++) {
                buffer.set(i, i + 1);
            }

            // Slice first 3 elements
            const firstSlice = Array.from(buffer.slice(0, 3));
            expect(firstSlice).toEqual([1, 2, 3]);

            // Slice last 2 elements
            const lastSlice = Array.from(buffer.slice(3, 5));
            expect(lastSlice).toEqual([4, 5]);

            // Slice with default end
            const defaultEndSlice = Array.from(buffer.slice(2));
            expect(defaultEndSlice).toEqual([3, 4, 5]);
        });
    });

    describe('ArrayBuffer', () => {
        it('should support full slice', () => {
            const buffer = createArrayBuffer({ type: 'string' }, 3);


            // Initialize with values
            for (let i = 0; i < 3; i++) {
                buffer.set(i, `value${i + 1}`);
            }

            const values = Array.from(buffer.slice());
            expect(values).toEqual(['value1', 'value2', 'value3']);
        });

        it('should support partial slicing', () => {
            const buffer = createArrayBuffer({ type: 'string' }, 4);


            // Initialize with values
            for (let i = 0; i < 4; i++) {
                buffer.set(i, `value${i + 1}`);
            }

            // Slice first 2 elements
            const firstSlice = Array.from(buffer.slice(0, 2));
            expect(firstSlice).toEqual(['value1', 'value2']);

            // Slice last 2 elements
            const lastSlice = Array.from(buffer.slice(2, 4));
            expect(lastSlice).toEqual(['value3', 'value4']);
        });
    });

    describe('StructBuffer', () => {
        const vec2Schema = {
            type: 'object',
            properties: {
                x: { type: 'number', precision: 1 },
                y: { type: 'number', precision: 1 }
            }
        } as const;

        it('should support full slice', () => {
            const buffer = createStructBuffer(vec2Schema, 3);
            // Initialize with values
            for (let i = 0; i < 3; i++) {
                buffer.set(i, { x: i + 1, y: i + 2 });
            }

            const values = Array.from(buffer.slice());
            expect(values).toEqual([
                { x: 1, y: 2 },
                { x: 2, y: 3 },
                { x: 3, y: 4 }
            ]);
        });

        it('should support partial slicing', () => {
            const buffer = createStructBuffer(vec2Schema, 4);

            // Initialize with values
            for (let i = 0; i < 4; i++) {
                buffer.set(i, { x: i + 1, y: i + 2 });
            }

            // Slice middle elements
            const middleSlice = Array.from(buffer.slice(1, 3));
            expect(middleSlice).toEqual([
                { x: 2, y: 3 },
                { x: 3, y: 4 }
            ]);
        });
    });
});
