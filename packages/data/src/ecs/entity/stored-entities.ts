// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "../../schema/index.js";
import { I32 } from "../../math/i32/index.js";
import { createTypedBuffer } from "../../typed-buffer/create-typed-buffer.js";
import { TypedBuffer } from "../../typed-buffer/typed-buffer.js";
import { schema as entitySchema } from "./schema.js";
import { fromStoredEntity, toStoredEntity } from "./persistence-sharing.js";

// Snapshots keep the 0.10.x format: an entity id is stored as an i32 with no
// generation, under an i32 entity schema. These convert schemas, values and
// columns between that stored form and the live one, wherever an entity
// schema (`entity: true`) appears in them.

const subschemas = (schema: Schema): readonly Schema[] => [
    ...Object.values(schema.properties ?? {}),
    ...(schema.items ? [schema.items] : []),
    ...(typeof schema.additionalProperties === "object" ? [schema.additionalProperties] : []),
    ...(schema.oneOf ?? []),
    ...(schema.anyOf ?? []),
    ...(schema.allOf ?? []),
];

const hasEntityCache = new WeakMap<Schema, boolean>();

/** Whether `schema` holds an entity id anywhere. */
export const hasEntity = (schema: Schema): boolean => {
    let result = hasEntityCache.get(schema);
    if (result === undefined) {
        result = schema.entity === true || subschemas(schema).some(hasEntity);
        hasEntityCache.set(schema, result);
    }
    return result;
};

const mapSchema = (schema: Schema, entity: (schema: Schema) => Schema): Schema => {
    if (schema.entity === true) return entity(schema);
    if (!hasEntity(schema)) return schema;
    const map = (s: Schema) => mapSchema(s, entity);
    return {
        ...schema,
        ...(schema.properties ? { properties: Object.fromEntries(Object.entries(schema.properties).map(([k, s]) => [k, map(s)])) } : {}),
        ...(schema.items ? { items: map(schema.items) } : {}),
        ...(typeof schema.additionalProperties === "object" ? { additionalProperties: map(schema.additionalProperties) } : {}),
        ...(schema.oneOf ? { oneOf: schema.oneOf.map(map) } : {}),
        ...(schema.anyOf ? { anyOf: schema.anyOf.map(map) } : {}),
        ...(schema.allOf ? { allOf: schema.allOf.map(map) } : {}),
    };
};

/** `schema` with every entity schema in it in the stored i32 form. */
export const toStoredSchema = (schema: Schema): Schema => mapSchema(schema, (s) => ({
    ...s,
    minimum: I32.schema.minimum,
    maximum: I32.schema.maximum,
    ...(typeof s.default === "number" ? { default: toStoredEntity(s.default) } : {}),
}));

/** `schema` with every stored i32 entity schema in it in the live form. */
export const fromStoredSchema = (schema: Schema): Schema => mapSchema(schema, (s) => ({
    ...s,
    minimum: entitySchema.minimum,
    maximum: entitySchema.maximum,
    ...(typeof s.default === "number" ? { default: fromStoredEntity(s.default) } : {}),
}));

/** Whether `value` has the kind `schema` describes, to pick a `oneOf`/`anyOf` branch. */
const fits = (value: unknown, schema: Schema): boolean => {
    if (value === null) return schema.type === "null";
    if (typeof value === "number") return schema.entity === true || schema.type === "number" || schema.type === "integer";
    if (Array.isArray(value)) return schema.type === "array" || schema.items !== undefined;
    if (typeof value === "object") return schema.type === "object" || schema.properties !== undefined;
    return false;
};

/** `value` (described by `schema`) with `map` applied to every entity id in it. */
const mapValue = (value: unknown, schema: Schema, map: (entity: number) => number): unknown => {
    if (schema.entity === true) return typeof value === "number" ? map(value) : value;
    if (value === null || value === undefined || !hasEntity(schema)) return value;
    if (schema.allOf) return schema.allOf.reduce<unknown>((v, s) => mapValue(v, s, map), value);
    const branch = (schema.oneOf ?? schema.anyOf)?.find((s) => fits(value, s));
    if (branch !== undefined) return mapValue(value, branch, map);
    if (Array.isArray(value)) {
        return schema.items ? value.map((item) => mapValue(item, schema.items!, map)) : value;
    }
    if (typeof value === "object") {
        const extra = typeof schema.additionalProperties === "object" ? schema.additionalProperties : undefined;
        const out: Record<string, unknown> = {};
        for (const [key, v] of Object.entries(value)) {
            const s = schema.properties?.[key] ?? extra;
            out[key] = s ? mapValue(v, s, map) : v;
        }
        return out;
    }
    return value;
};

/** `value` (described by the live `schema`) with every entity id in it in the stored i32 form. */
export const toStoredValue = (value: unknown, schema: Schema): unknown => mapValue(value, schema, toStoredEntity);

/** `value` (described by a stored or live `schema`) with every stored entity id in it widened, at generation 0. */
export const fromStoredValue = (value: unknown, schema: Schema): unknown => mapValue(value, schema, fromStoredEntity);

/**
 * A new column of `schema` holding `column`'s rows, with `map` applied to every entity id. Every row
 * up to capacity is copied, the vacated ones too, so a stored column is exactly what 0.10.x wrote.
 */
const mapColumn = (column: TypedBuffer<unknown>, schema: Schema, map: (entity: number) => number): TypedBuffer<unknown> => {
    const target = createTypedBuffer(schema, column.capacity);
    for (let row = 0; row < column.capacity; row++) {
        const value = column.get(row);
        if (value === undefined) continue;
        target.set(row, mapValue(value, column.schema, map));
    }
    return target;
};

type ArchetypeData = { readonly columns: Record<string, TypedBuffer<unknown>> };

const mapColumns = <T extends ArchetypeData>(
    data: T,
    schemaOf: (name: string, column: TypedBuffer<unknown>) => Schema | undefined,
    map: (entity: number) => number,
): T => {
    let columns: Record<string, TypedBuffer<unknown>> | undefined;
    for (const [name, column] of Object.entries(data.columns)) {
        // A const column holds one value for the whole archetype, recorded by its partition value.
        if (column.type === "const" || !hasEntity(column.schema)) continue;
        const schema = schemaOf(name, column);
        if (schema === undefined) continue;
        columns ??= { ...data.columns };
        columns[name] = mapColumn(column, schema, map);
    }
    return columns === undefined ? data : { ...data, columns };
};

/** An archetype's `toData` with its entity columns in the stored i32 form. */
export const toStoredArchetypeData = <T extends ArchetypeData>(data: T): T =>
    mapColumns(data, (_name, column) => toStoredSchema(column.schema), toStoredEntity);

/** Stored archetype data with its entity columns widened to `liveSchemas`, at generation 0. */
export const fromStoredArchetypeData = <T extends ArchetypeData>(data: T, liveSchemas: Readonly<Record<string, Schema>>): T =>
    mapColumns(data, (name, column) => (liveSchemas[name] !== undefined && hasEntity(liveSchemas[name]) ? liveSchemas[name] : fromStoredSchema(column.schema)), fromStoredEntity);
