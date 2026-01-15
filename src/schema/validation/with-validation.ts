// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from '../index.js';
import { validate } from './validate.js';

/**
 * Creates a function which can wrap another function and validate the input against a JSON Schema.
 */
export function withValidation<T extends Schema>(schema: T) {
    return function <F extends (arg: Schema.ToType<T>) => any>(fn: F): F {
        return function (this: any, arg: Schema.ToType<T>) {
            const errors = validate(schema, arg);

            if (errors.length > 0) {
                throw new Error(
                    `Validation failed: ${JSON.stringify(errors)}`
                );
            }

            return fn.call(this, arg);
        } as F;
    };
}
