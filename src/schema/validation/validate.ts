// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Validator, Schema as JsonSchema } from '@cfworker/json-schema';
import { Schema } from "../schema.js";

// Cache of validators using WeakMap to avoid memory leaks
const validatorCache = new WeakMap<Schema, Validator>();

export function validate(schema: Schema, data: any): string[] {
    // Get or create validator from cache
    let validator = validatorCache.get(schema);
    if (!validator) {
        validator = new Validator(schema as JsonSchema);
        validatorCache.set(schema, validator);
    }

    const result = validator.validate(data);
    if (result.valid) {
        return [];
    }
    return result.errors.map((error) => error.error);
}