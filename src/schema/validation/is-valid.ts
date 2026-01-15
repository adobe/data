// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "../schema.js";
import { validate } from "./validate.js";

export function isValid(schema: Schema, data: any) {
    try {
        return validate(schema, data ?? null).length === 0;
    } catch (error) {
        console.error(`Error during validation:`, error);
        return false;
    }
}
