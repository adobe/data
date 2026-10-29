// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Schema } from "@adobe/ecs";

// Values of components stored as values, strings and other data that isn't a fixed layout, as JSON their schema reads
// back: a map as its entries, a set as its items, numbers JSON lacks as text, and a union's value as its member's
// index and its JSON.

/** A number JSON can't hold, as text: `NaN`, `Infinity`, `-Infinity` or `-0`. */
const numberToJson = (value: number): number | string =>
    Number.isNaN(value) ? "NaN" : value === Infinity ? "Infinity" : value === -Infinity ? "-Infinity" : Object.is(value, -0) ? "-0" : value;

const numberFromJson = (json: unknown): unknown => {
    if (typeof json !== "string") return json;
    switch (json) {
        case "NaN": return NaN;
        case "Infinity": return Infinity;
        case "-Infinity": return -Infinity;
        case "-0": return -0;
        default: return json;
    }
};

/** Whether a value is of the JSON kind a schema's values are, to pick a union's member. */
const fits = (schema: Schema, value: unknown): boolean => {
    if ("const" in schema) return Object.is(schema.const, value) || JSON.stringify(schema.const) === JSON.stringify(value);
    if ("anyOf" in schema) return schema.anyOf.some(member => fits(member, value));
    if ("allOf" in schema) return schema.allOf.every(member => fits(member, value));
    if (!("type" in schema)) return true;
    switch (schema.type) {
        case "number": case "integer": return typeof value === "number";
        case "string": return typeof value === "string";
        case "boolean": return typeof value === "boolean";
        case "null": return value === null;
        case "array": return Array.isArray(value);
        case "set": return value instanceof Set;
        case "map": return value instanceof Map;
        case "object": return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Set) && !(value instanceof Map);
        default: return true;
    }
};

/** A value of `schema` as JSON. */
export const toJson = (schema: Schema, value: unknown): unknown => {
    if ("anyOf" in schema) {
        const index = schema.anyOf.findIndex(candidate => fits(candidate, value));
        const member = schema.anyOf[index];
        return member === undefined ? [-1, value] : [index, toJson(member, value)];
    }
    if (typeof value === "number") return numberToJson(value);
    if (!("type" in schema)) return value;
    switch (schema.type) {
        case "array": return Array.isArray(value) ? value.map(item => toJson(schema.items, item)) : value;
        case "set": return value instanceof Set ? Array.from(value, item => toJson(schema.items, item)) : value;
        case "map": return value instanceof Map ? Array.from(value, ([key, item]) => [toJson(schema.keys, key), toJson(schema.values, item)]) : value;
        case "object": {
            if (typeof value !== "object" || value === null) return value;
            const json: { [name: string]: unknown } = {};
            for (const name of Object.keys(value)) {
                const field = schema.properties[name];
                const item: unknown = Reflect.get(value, name);
                if (item !== undefined) json[name] = field === undefined ? item : toJson(field, item);
            }
            return json;
        }
        default: return value;
    }
};

/** A value of `schema` read back from its JSON. */
export const fromJson = (schema: Schema, json: unknown): unknown => {
    if ("anyOf" in schema) {
        if (!Array.isArray(json) || typeof json[0] !== "number") return json;
        const member = schema.anyOf[json[0]];
        return member === undefined ? json[1] : fromJson(member, json[1]);
    }
    if ("const" in schema) return schema.const;
    if (!("type" in schema)) return json;
    switch (schema.type) {
        case "number": case "integer": return numberFromJson(json);
        case "array": return Array.isArray(json) ? json.map(item => fromJson(schema.items, item)) : json;
        case "set": return Array.isArray(json) ? new Set(json.map(item => fromJson(schema.items, item))) : json;
        case "map": return Array.isArray(json)
            ? new Map(json.map(entry => Array.isArray(entry) ? [fromJson(schema.keys, entry[0]), fromJson(schema.values, entry[1])] : [entry, undefined]))
            : json;
        case "object": {
            if (typeof json !== "object" || json === null || Array.isArray(json)) return json;
            const value: { [name: string]: unknown } = {};
            for (const name of Object.keys(json)) {
                const field = schema.properties[name];
                const item: unknown = Reflect.get(json, name);
                value[name] = field === undefined ? item : fromJson(field, item);
            }
            return value;
        }
        default: return json;
    }
};
