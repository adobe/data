import type { Schema } from '../schema/schema.js';

/** Whether a constant is a struct's value: numbers and booleans, in fixed arrays and objects. */
const isStructValue = (value: unknown): boolean =>
    typeof value === "number" || typeof value === "boolean"
    || (Array.isArray(value) ? value.every(isStructValue) : typeof value === "object" && value !== null && Object.values(value).every(isStructValue));

/** Whether a schema describes a struct: numbers, booleans, entities, fixed-length tuples and structs of those. */
export const isStruct = (schema: Schema): boolean => {
    if ("const" in schema) return isStructValue(schema.const);
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
