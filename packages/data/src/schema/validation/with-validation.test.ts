// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from 'vitest';
import { withValidation } from './with-validation.js';
import { Schema } from '../index.js';

// Define a test schema
const userSchema = {
    type: 'object',
    properties: {
        name: { type: 'string' },
        age: { type: 'number' },
        foo: { type: 'string' },
        email: { type: 'string', format: 'email' }
    },
    required: ['name', 'age', 'email']
} as const;

describe('withValidation', () => {
    it('should pass validation for valid input', () => {
        const createUser = withValidation(userSchema)((user: Schema.ToType<typeof userSchema>) => user);

        const validUser = {
            name: 'John Doe',
            age: 30,
            email: 'john@example.com'
        };

        expect(() => createUser(validUser)).not.toThrow();
        expect(createUser(validUser)).toEqual(validUser);
    });

    it('should throw error for invalid input', () => {
        const createUser = withValidation(userSchema)((user: Schema.ToType<typeof userSchema>) => user);

        const invalidUser = {
            name: 'John Doe',
            age: '30', // Should be a number
            email: 'not-an-email'
        };

        expect(() => createUser(invalidUser as any)).toThrow(/Validation failed/);
    });

    it('should throw error for missing required fields', () => {
        const createUser = withValidation(userSchema)((user: Schema.ToType<typeof userSchema>) => user);

        const incompleteUser = {
            name: 'John Doe',
            // Missing age and email
        };

        expect(() => createUser(incompleteUser as any)).toThrow(/Validation failed/);
    });

    it('should preserve function return type', () => {
        const processUser = withValidation(userSchema)(
            (user: Schema.ToType<typeof userSchema>) => ({
                ...user,
                processed: true
            })
        );

        const result = processUser({
            name: 'John Doe',
            age: 30,
            email: 'john@example.com'
        });

        expect(result).toEqual({
            name: 'John Doe',
            age: 30,
            email: 'john@example.com',
            processed: true
        });
    });

    it("should pass 'this' context to the wrapped function", () => {
        const context = { value: 42 };
        const fn = function (this: typeof context, user: Schema.ToType<typeof userSchema>) {
            return this.value;
        };
        const wrapped = withValidation(userSchema)(fn);
        const validUser = {
            name: 'Jane Doe',
            age: 25,
            email: 'jane@example.com'
        };
        // Bind context and call
        const result = wrapped.call(context, validUser);
        expect(result).toBe(42);
    });
});
