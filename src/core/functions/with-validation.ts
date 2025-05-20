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
import { Validator, Schema as JsonSchema } from '@cfworker/json-schema';
import { Schema, FromSchema } from '../../index.js';

/**
 * Creates a function which can wrap another function and validate the input against a JSON Schema.
 */
export function withValidation<T extends Schema>(schema: T) {
    const validator = new Validator(schema as JsonSchema);

    return function <F extends (arg: FromSchema<T>) => any>(fn: F): F {
        return function (this: any, arg: FromSchema<T>) {
            const validation = validator.validate(arg);

            if (!validation.valid) {
                throw new Error(
                    `Validation failed: ${JSON.stringify(validation.errors)}`
                );
            }

            return fn.call(this, arg);
        } as F;
    };
}
