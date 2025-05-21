/*MIT License

© Copyright 2025 Adobe. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/
import { describe, it, expect } from 'vitest';
import { withValidation } from './with-validation.js';
import { FromSchema } from '../index.js';

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
        const createUser = withValidation(userSchema)((user: FromSchema<typeof userSchema>) => user);

        const validUser = {
            name: 'John Doe',
            age: 30,
            email: 'john@example.com'
        };

        expect(() => createUser(validUser)).not.toThrow();
        expect(createUser(validUser)).toEqual(validUser);
    });

    it('should throw error for invalid input', () => {
        const createUser = withValidation(userSchema)((user: FromSchema<typeof userSchema>) => user);

        const invalidUser = {
            name: 'John Doe',
            age: '30', // Should be a number
            email: 'not-an-email'
        };

        expect(() => createUser(invalidUser as any)).toThrow(/Validation failed/);
    });

    it('should throw error for missing required fields', () => {
        const createUser = withValidation(userSchema)((user: FromSchema<typeof userSchema>) => user);

        const incompleteUser = {
            name: 'John Doe',
            // Missing age and email
        };

        expect(() => createUser(incompleteUser as any)).toThrow(/Validation failed/);
    });

    it('should preserve function return type', () => {
        const processUser = withValidation(userSchema)(
            (user: FromSchema<typeof userSchema>) => ({
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
        const fn = function (this: typeof context, user: FromSchema<typeof userSchema>) {
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
