// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from 'vitest';
import { isValid } from './is-valid.js';
import { Schema } from '../schema.js';

describe('isValid', () => {
    const schema: Schema = {
        type: 'object',
        properties: {
            foo: { type: 'string' }
        },
        required: ['foo']
    };

    it('returns true for valid data', () => {
        expect(isValid(schema, { foo: 'bar' })).toBe(true);
    });

    it('returns false for invalid data', () => {
        expect(isValid(schema, { foo: 123 })).toBe(false);
        expect(isValid(schema, {})).toBe(false);
    });
}); 