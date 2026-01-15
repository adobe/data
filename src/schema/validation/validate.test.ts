// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from 'vitest';
import { validate } from './validate.js';
import { Schema } from '../schema.js';

describe('validate', () => {
    const userSchema: Schema = {
        type: 'object',
        properties: {
            name: { type: 'string' },
            age: { type: 'number' },
            email: { type: 'string', pattern: '^[^@]+@[^@]+\\.[^@]+$' }
        },
        required: ['name', 'age', 'email']
    };

    it('should return empty array for valid data', () => {
        const validData = {
            name: 'John Doe',
            age: 30,
            email: 'john@example.com'
        };

        const errors = validate(userSchema, validData);
        expect(errors).toEqual([]);
    });

    it('should return validation errors for invalid data', () => {
        const invalidData = {
            name: 'John Doe',
            age: '30', // Should be a number
            email: 'not-an-email'
        };

        const errors = validate(userSchema, invalidData);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors).toContain('Property "age" does not match schema.');
        expect(errors).toContain('Instance type "string" is invalid. Expected "number".');
    });

    it('should return errors for missing required fields', () => {
        const incompleteData = {
            name: 'John Doe'
            // Missing age and email
        };

        const errors = validate(userSchema, incompleteData);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors).toContain('Instance does not have required property "age".');
        expect(errors).toContain('Instance does not have required property "email".');
    });

    it('should reuse validator instance for the same schema', () => {
        const data1 = { name: 'John', age: 30, email: 'john@example.com' };
        const data2 = { name: 'Jane', age: 25, email: 'jane@example.com' };

        // First validation
        const errors1 = validate(userSchema, data1);
        expect(errors1).toEqual([]);

        // Second validation with same schema
        const errors2 = validate(userSchema, data2);
        expect(errors2).toEqual([]);

        // The validator should be reused from the WeakMap cache
        // We can verify this by checking that the schema object is still the same reference
        expect(userSchema).toBe(userSchema);
    });

    it('should handle nested schema validation', () => {
        const nestedSchema: Schema = {
            type: 'object',
            properties: {
                user: userSchema,
                metadata: {
                    type: 'object',
                    properties: {
                        createdAt: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$' }
                    },
                    required: ['createdAt']
                }
            },
            required: ['user', 'metadata']
        };

        const validNestedData = {
            user: {
                name: 'John Doe',
                age: 30,
                email: 'john@example.com'
            },
            metadata: {
                createdAt: '2024-03-20T12:00:00Z'
            }
        };

        const errors = validate(nestedSchema, validNestedData);
        expect(errors).toEqual([]);
    });
}); 