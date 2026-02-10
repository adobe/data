// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from 'vitest';
import { typedBufferEquals } from './typed-buffer-equals.js';
import { createNumberBuffer } from './create-number-buffer.js';
import { createArrayBuffer } from './create-array-buffer.js';
import { createStructBuffer } from './create-struct-buffer.js';
import { createConstBuffer } from './create-const-buffer.js';
import { createTypedBuffer } from './create-typed-buffer.js';

describe('typedBufferEquals', () => {
    describe('same reference', () => {
        it('should return true for identical references', () => {
            const buffer = createNumberBuffer({ type: 'number', precision: 1 }, 3);
            expect(typedBufferEquals(buffer, buffer)).toBe(true);
        });
    });

    describe('structural differences', () => {
        it('should return false for different types', () => {
            const numberBuffer = createNumberBuffer({ type: 'number', precision: 1 }, 3);
            const arrayBuffer = createArrayBuffer({ type: 'string' }, 3);
            
            expect(typedBufferEquals(numberBuffer, arrayBuffer)).toBe(false);
        });

        it('should return false for different schemas', () => {
            const buffer1 = createNumberBuffer({ type: 'number', precision: 1 }, 3);
            const buffer2 = createNumberBuffer({ type: 'number', precision: 2 }, 3);
            
            expect(typedBufferEquals(buffer1, buffer2)).toBe(false);
        });

        it('should return false for different capacities', () => {
            const buffer1 = createNumberBuffer({ type: 'number', precision: 1 }, 3);
            const buffer2 = createNumberBuffer({ type: 'number', precision: 1 }, 5);
            
            expect(typedBufferEquals(buffer1, buffer2)).toBe(false);
        });
    });

    describe('number buffers', () => {
        it('should return true for identical number buffers', () => {
            const schema = { type: 'number', precision: 1 } as const;
            const buffer1 = createNumberBuffer(schema, 3);
            const buffer2 = createNumberBuffer(schema, 3);
            
            buffer1.set(0, 1.5);
            buffer1.set(1, 2.5);
            buffer1.set(2, 3.5);
            
            buffer2.set(0, 1.5);
            buffer2.set(1, 2.5);
            buffer2.set(2, 3.5);
            
            expect(typedBufferEquals(buffer1, buffer2)).toBe(true);
        });

        it('should return false for different values', () => {
            const buffer1 = createNumberBuffer({ type: 'number', precision: 1 }, 3);
            const buffer2 = createNumberBuffer({ type: 'number', precision: 1 }, 3);
            
            buffer1.set(0, 1.5);
            buffer1.set(1, 2.5);
            buffer1.set(2, 3.5);
            
            buffer2.set(0, 1.5);
            buffer2.set(1, 2.5);
            buffer2.set(2, 4.5); // Different value
            
            expect(typedBufferEquals(buffer1, buffer2)).toBe(false);
        });

        it('should handle different number precisions', () => {
            const f32Buffer = createNumberBuffer({ type: 'number', precision: 1 }, 2);
            const f64Buffer = createNumberBuffer({ type: 'number', precision: 2 }, 2);
            
            f32Buffer.set(0, 1.5);
            f32Buffer.set(1, 2.5);
            
            f64Buffer.set(0, 1.5);
            f64Buffer.set(1, 2.5);
            
            expect(typedBufferEquals(f32Buffer, f64Buffer)).toBe(false);
        });
    });

    describe('array buffers', () => {
        it('should return true for identical array buffers', () => {
            const buffer1 = createArrayBuffer({ type: 'string' }, 3);
            const buffer2 = createArrayBuffer({ type: 'string' }, 3);
            
            buffer1.set(0, 'hello');
            buffer1.set(1, 'world');
            buffer1.set(2, 'test');
            
            buffer2.set(0, 'hello');
            buffer2.set(1, 'world');
            buffer2.set(2, 'test');
            
            expect(typedBufferEquals(buffer1, buffer2)).toBe(true);
        });

        it('should return false for different array values', () => {
            const buffer1 = createArrayBuffer({ type: 'string' }, 3);
            const buffer2 = createArrayBuffer({ type: 'string' }, 3);
            
            buffer1.set(0, 'hello');
            buffer1.set(1, 'world');
            buffer1.set(2, 'test');
            
            buffer2.set(0, 'hello');
            buffer2.set(1, 'world');
            buffer2.set(2, 'different'); // Different value
            
            expect(typedBufferEquals(buffer1, buffer2)).toBe(false);
        });

        it('should handle complex array values', () => {
            const buffer1 = createArrayBuffer({ type: 'array', items: { type: 'number' } }, 2);
            const buffer2 = createArrayBuffer({ type: 'array', items: { type: 'number' } }, 2);
            
            buffer1.set(0, [1, 2, 3]);
            buffer1.set(1, [4, 5, 6]);
            
            buffer2.set(0, [1, 2, 3]);
            buffer2.set(1, [4, 5, 6]);
            
            expect(typedBufferEquals(buffer1, buffer2)).toBe(true);
        });
    });

    describe('struct buffers', () => {
        const vec2Schema = {
            type: 'object',
            properties: {
                x: { type: 'number', precision: 1 },
                y: { type: 'number', precision: 1 }
            }
        } as const;

        it('should return true for identical struct buffers', () => {
            const buffer1 = createStructBuffer(vec2Schema, 3);
            const buffer2 = createStructBuffer(vec2Schema, 3);
            
            buffer1.set(0, { x: 1.5, y: 2.5 });
            buffer1.set(1, { x: 3.5, y: 4.5 });
            buffer1.set(2, { x: 5.5, y: 6.5 });
            
            buffer2.set(0, { x: 1.5, y: 2.5 });
            buffer2.set(1, { x: 3.5, y: 4.5 });
            buffer2.set(2, { x: 5.5, y: 6.5 });
            
            expect(typedBufferEquals(buffer1, buffer2)).toBe(true);
        });

        it('should return false for different struct values', () => {
            const buffer1 = createStructBuffer(vec2Schema, 2);
            const buffer2 = createStructBuffer(vec2Schema, 2);
            
            buffer1.set(0, { x: 1.5, y: 2.5 });
            buffer1.set(1, { x: 3.5, y: 4.5 });
            
            buffer2.set(0, { x: 1.5, y: 2.5 });
            buffer2.set(1, { x: 3.5, y: 5.5 }); // Different y value
            
            expect(typedBufferEquals(buffer1, buffer2)).toBe(false);
        });
    });

    describe('const buffers', () => {
        it('should return true for identical const buffers', () => {
            const buffer1 = createConstBuffer({ const: 42 }, 3);
            const buffer2 = createConstBuffer({ const: 42 }, 3);
            
            expect(typedBufferEquals(buffer1, buffer2)).toBe(true);
        });

        it('should return false for different const values', () => {
            const buffer1 = createConstBuffer({ const: 42 }, 3);
            const buffer2 = createConstBuffer({ const: 43 }, 3);
            
            expect(typedBufferEquals(buffer1, buffer2)).toBe(false);
        });

        it('should handle complex const values', () => {
            const complexValue = { x: 1, y: 2, z: 3 };
            const buffer1 = createConstBuffer({ const: complexValue }, 2);
            const buffer2 = createConstBuffer({ const: complexValue }, 2);
            
            expect(typedBufferEquals(buffer1, buffer2)).toBe(true);
        });
    });

    describe('mixed buffer types', () => {
        it('should return false when comparing different buffer types with same content', () => {
            const numberBuffer = createNumberBuffer({ type: 'number', precision: 1 }, 3);
            const arrayBuffer = createArrayBuffer({ type: 'number' }, 3);
            
            numberBuffer.set(0, 1);
            numberBuffer.set(1, 2);
            numberBuffer.set(2, 3);
            
            arrayBuffer.set(0, 1);
            arrayBuffer.set(1, 2);
            arrayBuffer.set(2, 3);
            
            expect(typedBufferEquals(numberBuffer, arrayBuffer)).toBe(false);
        });
    });

    describe('createTypedBuffer integration', () => {
        it('should work with createTypedBuffer for number buffers', () => {
            const buffer1 = createTypedBuffer({ type: 'number', precision: 1 }, [1.5, 2.5, 3.5]);
            const buffer2 = createTypedBuffer({ type: 'number', precision: 1 }, [1.5, 2.5, 3.5]);
            
            expect(typedBufferEquals(buffer1, buffer2)).toBe(true);
        });

        it('should work with createTypedBuffer for array buffers', () => {
            const buffer1 = createArrayBuffer({ type: 'string' }, 2);
            const buffer2 = createArrayBuffer({ type: 'string' }, 2);
            
            buffer1.set(0, 'hello');
            buffer1.set(1, 'world');
            
            buffer2.set(0, 'hello');
            buffer2.set(1, 'world');
            
            expect(typedBufferEquals(buffer1, buffer2)).toBe(true);
        });

        it('should work with createTypedBuffer for struct buffers', () => {
            const schema = {
                type: 'object',
                properties: {
                    x: { type: 'number', precision: 1 },
                    y: { type: 'number', precision: 1 }
                }
            } as const;
            
            const buffer1 = createTypedBuffer(schema, [{ x: 1, y: 2 }, { x: 3, y: 4 }]);
            const buffer2 = createTypedBuffer(schema, [{ x: 1, y: 2 }, { x: 3, y: 4 }]);
            
            expect(typedBufferEquals(buffer1, buffer2)).toBe(true);
        });
    });

    describe('edge cases', () => {
        it('should handle empty buffers', () => {
            const buffer1 = createNumberBuffer({ type: 'number', precision: 1 }, 0);
            const buffer2 = createNumberBuffer({ type: 'number', precision: 1 }, 0);
            
            expect(typedBufferEquals(buffer1, buffer2)).toBe(true);
        });

        it('should handle buffers with undefined values', () => {
            const buffer1 = createArrayBuffer({ type: 'string' }, 2);
            const buffer2 = createArrayBuffer({ type: 'string' }, 2);
            
            buffer1.set(0, 'hello');
            buffer1.set(1, undefined as any);
            
            buffer2.set(0, 'hello');
            buffer2.set(1, undefined as any);
            
            expect(typedBufferEquals(buffer1, buffer2)).toBe(true);
        });

        it('should handle buffers with null values', () => {
            const buffer1 = createArrayBuffer({ type: 'string' }, 2);
            const buffer2 = createArrayBuffer({ type: 'string' }, 2);
            
            buffer1.set(0, 'hello');
            buffer1.set(1, null as any);
            
            buffer2.set(0, 'hello');
            buffer2.set(1, null as any);
            
            expect(typedBufferEquals(buffer1, buffer2)).toBe(true);
        });
    });
}); 