// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Schema } from '../schema/schema.js';

/** Whether a constant is a struct's value: numbers and booleans, in fixed arrays and objects. */
const isStructValue = (value: unknown): boolean =>
    typeof value === "number" || typeof value === "boolean"
    || (Array.isArray(value) ? value.every(isStructValue) : typeof value === "object" && value !== null && Object.values(value).every(isStructValue));

/** The values of a union of number constants, which is stored as a number, or null for any other schema. */
export const numberConstants = (schema: Schema): readonly number[] | null => {
    if (!("anyOf" in schema) || schema.anyOf.length === 0) return null;
    const values: number[] = [];
    for (const option of schema.anyOf) {
        if (!("const" in option) || typeof option.const !== "number") return null;
        values.push(option.const);
    }
    return values;
};

/** Whether a schema describes a struct: numbers, booleans, entities, fixed-length tuples and structs of those. */
export const isStruct = (schema: Schema): boolean => {
    if ("const" in schema) return isStructValue(schema.const);
    if (numberConstants(schema) !== null) return true;
    if (!("type" in schema)) return false;
    switch (schema.type) {
        case "number":
        case "integer":
        case "boolean":
            return true;
        case "array":
            return schema.minItems !== undefined && schema.minItems === schema.maxItems && isStruct(schema.items);
        case "object": {
            const { required, properties } = schema;
            const names = Object.keys(properties);
            return (required === undefined || names.every(name => required.includes(name))) && names.every(name => isStruct(properties[name]));
        }
        default:
            return false;
    }
};

const isNull = (schema: Schema): boolean => ("type" in schema && schema.type === "null") || ("const" in schema && schema.const === null);

/** Whether a schema describes a string: any string, a string `const`, or a union of those, with `null` or without. */
export const isString = (schema: Schema): boolean => {
    if ("const" in schema) return typeof schema.const === "string";
    if ("anyOf" in schema) return schema.anyOf.some(isString) && schema.anyOf.every(member => isString(member) || isNull(member));
    return "type" in schema && schema.type === "string";
};

const hasBooleanValue = (value: unknown): boolean =>
    typeof value === "boolean" || (typeof value === "object" && value !== null && Object.values(value).some(hasBooleanValue));

/** Whether a struct schema has a boolean leaf. */
export const hasBoolean = (schema: Schema): boolean => {
    if ("const" in schema) return hasBooleanValue(schema.const);
    if (!("type" in schema)) return false;
    if (schema.type === "boolean") return true;
    if (schema.type === "array") return hasBoolean(schema.items);
    if (schema.type === "object") return Object.values(schema.properties).some(hasBoolean);
    return false;
};

/** Whether a schema accepts `null`, so a value of it may start there. */
export const allowsNull = (schema: Schema): boolean =>
    ("type" in schema && schema.type === "null") || ("const" in schema && schema.const === null) || ("anyOf" in schema && schema.anyOf.some(allowsNull));

/** Whether a schema is an entity's. */
export const isEntity = (schema: Schema): boolean => "format" in schema && schema.format === "entity";

/** Whether a schema accepts `null` or `false`, so a system can run on the condition of a value of it. */
export const conditional = (schema: Schema): boolean =>
    allowsNull(schema) || ("type" in schema && schema.type === "boolean") || ("const" in schema && schema.const === false)
    || ("anyOf" in schema && schema.anyOf.some(conditional));

/** Whether `value` is one of `schema`'s values, as a default must be: its type, length, range and fields. */
export const matchesSchema = (schema: Schema, value: unknown): boolean => {
    if ("anyOf" in schema) return schema.anyOf.some(member => matchesSchema(member, value));
    if ("allOf" in schema) return schema.allOf.every(member => matchesSchema(member, value));
    if ("const" in schema) return Object.is(schema.const, value) || JSON.stringify(schema.const) === JSON.stringify(value);
    switch (schema.type) {
        case "null": return value === null;
        case "boolean": return typeof value === "boolean";
        case "string": return typeof value === "string" && value.length >= (schema.minLength ?? 0) && value.length <= (schema.maxLength ?? Infinity);
        case "number": return typeof value === "number" && (Number.isNaN(value) || (value >= (schema.minimum ?? -Infinity) && value <= (schema.maximum ?? Infinity)));
        case "integer": return typeof value === "number" && Number.isInteger(value) && ("format" in schema || (value >= (schema.minimum ?? -Infinity) && value <= (schema.maximum ?? Infinity)));
        case "array": return Array.isArray(value) && value.length >= (schema.minItems ?? 0) && value.length <= (schema.maxItems ?? Infinity) && value.every(item => matchesSchema(schema.items, item));
        case "set": return value instanceof Set;
        case "map": return value instanceof Map;
        case "object": {
            if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
            const required = schema.required ?? Object.keys(schema.properties);
            return Object.entries(value).every(([field, item]) => field in schema.properties && matchesSchema(schema.properties[field] ?? { allOf: [] }, item))
                && required.every(field => field in value);
        }
        default: return false;
    }
};
