// © 2026 Adobe. MIT License. See /LICENSE for details.
import { memoizeFactory } from "../../internal/function/memoize-factory.js";
import { I32 } from "../../math/i32/index.js";
import { type Schema } from "../../schema/index.js";
import { U32 } from "../../math/u32/index.js";
import type { StructFieldPrimitiveType, StructLayout, Layout } from "./struct-layout.js";

const PACKED_RULES = {
    vecAlign: 4,
    structAlign: 1,
    arrayAlign: 1,
} as const;

const roundUpToAlignment = (offset: number, alignment: number): number =>
    Math.ceil(offset / alignment) * alignment;

/**
 * WGSL host-shareable alignment for a resolved struct field type (§14.4).
 */
const wgslAlignmentOfType = (type: StructFieldPrimitiveType | StructLayout): number => {
    if (typeof type === "string") {
        return 4;
    }
    if (type.type === "object") {
        let maxA = 1;
        for (const f of Object.values(type.fields)) {
            maxA = Math.max(maxA, wgslAlignmentOfType(f.type));
        }
        return maxA;
    }
    const keys = Object.keys(type.fields).sort((a, b) => Number(a) - Number(b));
    if (keys.length === 0) {
        return 1;
    }
    const first = type.fields[keys[0]!]!;
    const allScalarF32 = keys.every((k) => type.fields[k]!.type === "f32");
    if (allScalarF32) {
        if (keys.length === 2 && type.size === 8) {
            return 8;
        }
        if (keys.length === 3 && type.size === 12) {
            return 16;
        }
        if (keys.length === 4 && type.size === 16) {
            return 16;
        }
        if (keys.length === 16 && type.size === 64) {
            return 16;
        }
        return 4;
    }
    return wgslAlignmentOfType(first.type);
};

const getFieldSize = (type: StructFieldPrimitiveType | StructLayout): number => {
    if (typeof type === "string") {
        return 4;
    }
    return type.size;
};

const wgslArrayStride = (elementType: StructFieldPrimitiveType | StructLayout): number => {
    const a = wgslAlignmentOfType(elementType);
    const s = getFieldSize(elementType);
    return roundUpToAlignment(a, s);
};

const getStructFieldAlignmentPacked = (
    type: StructFieldPrimitiveType | StructLayout,
): number => {
    if (typeof type === "string") {
        return 4;
    }
    return type.type === "array" ? PACKED_RULES.arrayAlign : PACKED_RULES.structAlign;
};

const getArrayElementStridePacked = (
    type: StructFieldPrimitiveType | StructLayout,
): number => {
    if (typeof type === "string") {
        return 4;
    }
    return type.size;
};

const getArrayElementAlignmentPacked = (
    type: StructFieldPrimitiveType | StructLayout,
): number => {
    if (typeof type === "string") {
        return 4;
    }
    return PACKED_RULES.arrayAlign;
};

/**
 * Converts a primitive schema type to a StructFieldPrimitiveType or returns null if not a valid primitive type
 */
const getPrimitiveType = (schema: Schema): StructFieldPrimitiveType | null => {
    if (schema.type === "number" || schema.type === "integer") {
        if (schema.type === "integer") {
            if (schema.minimum !== undefined && schema.minimum >= 0 && schema.maximum && schema.maximum <= U32.schema.maximum) {
                return "u32";
            }
            if (schema.minimum !== undefined && schema.minimum < 0 && schema.maximum && schema.maximum <= I32.schema.maximum) {
                return "i32";
            }
        }
        else if (schema.precision === 1 || schema.precision === 2) {
            return "f32";
        }
    }

    return null;
};

const buildScalarVectorLayout = (
    primitiveType: StructFieldPrimitiveType,
    count: number,
    layout: Layout,
): StructLayout => {
    const fields: StructLayout["fields"] = {};
    for (let i = 0; i < count; i++) {
        fields[i.toString()] = {
            offset: i * 4,
            type: primitiveType,
        };
    }
    const rawSize = count * 4;
    const size =
        layout === "packed"
            ? rawSize
            : count === 2
              ? 8
              : count === 3
                ? 12
                : count === 4
                  ? 16
                  : count === 16
                    ? 64
                    : rawSize;
    return {
        type: "array",
        size,
        fields,
        layout,
    };
};

/**
 * Analyzes a Schema and returns a StructLayout.
 * Returns null if schema is not a valid struct schema.
 */
const getStructLayoutInternal = memoizeFactory(
    ({ schema, layout }: { schema: Schema; layout: Layout }): StructLayout | null =>
        getStructLayoutInternalImpl(schema, layout, false),
);

const getStructLayoutInternalImpl = (
    schema: Schema,
    layout: Layout = "wgsl",
    throwsOnError: boolean = false,
): StructLayout | null => {
    if (schema.type === "array") {
        if (!schema.items || Array.isArray(schema.items)) {
            if (throwsOnError) {
                throw new Error("Array schema must have single item type");
            }
            return null;
        }
        if (schema.minItems !== schema.maxItems || !schema.minItems) {
            if (throwsOnError) {
                throw new Error("Array must have fixed length");
            }
            return null;
        }
        if (schema.minItems < 1) {
            if (throwsOnError) {
                throw new Error("Array length must be at least 1");
            }
            return null;
        }

        const primitiveType = getPrimitiveType(schema.items);
        const n = schema.minItems;

        if (primitiveType === "f32" && (n === 2 || n === 3 || n === 4 || n === 16)) {
            return buildScalarVectorLayout(primitiveType, n, layout);
        }

        const fields: StructLayout["fields"] = {};
        const elementType = primitiveType ?? getStructLayoutInternal({ schema: schema.items, layout });
        if (!elementType) {
            if (throwsOnError) {
                throw new Error("Array element type is not a valid struct type");
            }
            return null;
        }

        if (layout === "packed") {
            let currentOffset = 0;
            currentOffset = roundUpToAlignment(currentOffset, PACKED_RULES.arrayAlign);
            const elementAlignment = getArrayElementAlignmentPacked(elementType);
            const stride = getArrayElementStridePacked(elementType);
            for (let i = 0; i < schema.minItems; i++) {
                currentOffset = roundUpToAlignment(currentOffset, elementAlignment);
                fields[i.toString()] = {
                    offset: currentOffset,
                    type: elementType,
                };
                currentOffset += stride;
            }
            const size = roundUpToAlignment(currentOffset, 1);
            return {
                type: "array",
                size,
                fields,
                layout,
            };
        }

        const elAlign = wgslAlignmentOfType(elementType);
        const elSize = getFieldSize(elementType);
        const stride = wgslArrayStride(elementType);
        let cur = roundUpToAlignment(0, elAlign);
        for (let i = 0; i < schema.minItems; i++) {
            cur = roundUpToAlignment(cur, elAlign);
            fields[i.toString()] = {
                offset: cur,
                type: elementType,
            };
            cur += stride;
        }
        const size = roundUpToAlignment(cur - stride + elSize, elAlign);
        return {
            type: "array",
            size,
            fields,
            layout,
        };
    }

    if (schema.type !== "object" || !schema.properties) {
        if (throwsOnError) {
            throw new Error("Schema must be an object type with properties definition");
        }
        return null;
    }

    const fields: StructLayout["fields"] = {};
    let currentOffset = 0;

    if (layout === "packed") {
        for (const [name, fieldSchema] of Object.entries(schema.properties)) {
            const primitiveType = getPrimitiveType(fieldSchema);
            const fieldType = primitiveType ?? getStructLayoutInternal({ schema: fieldSchema, layout });
            if (!fieldType) {
                if (throwsOnError) {
                    throw new Error(`Field "${name}" is not a valid struct type`);
                }
                return null;
            }
            const alignment = getStructFieldAlignmentPacked(fieldType);
            currentOffset = roundUpToAlignment(currentOffset, alignment);
            fields[name] = {
                offset: currentOffset,
                type: fieldType,
            };
            currentOffset += getFieldSize(fieldType);
        }
        const size = roundUpToAlignment(currentOffset, 1);
        return {
            type: "object",
            size,
            fields,
            layout,
        };
    }

    let structAlign = 1;
    for (const [name, fieldSchema] of Object.entries(schema.properties)) {
        const primitiveType = getPrimitiveType(fieldSchema);
        const fieldType = primitiveType ?? getStructLayoutInternal({ schema: fieldSchema, layout });
        if (!fieldType) {
            if (throwsOnError) {
                throw new Error(`Field "${name}" is not a valid struct type`);
            }
            return null;
        }
        const alignment = wgslAlignmentOfType(fieldType);
        structAlign = Math.max(structAlign, alignment);
        currentOffset = roundUpToAlignment(currentOffset, alignment);
        fields[name] = {
            offset: currentOffset,
            type: fieldType,
        };
        currentOffset += getFieldSize(fieldType);
    }
    const size = roundUpToAlignment(currentOffset, structAlign);
    return {
        type: "object",
        size,
        fields,
        layout,
    };
};

export function getStructLayout(schema: Schema): StructLayout;
export function getStructLayout(schema: Schema, throwError: boolean): StructLayout | null;
export function getStructLayout(schema: Schema, throwError: boolean = true): StructLayout | null {
    const layout = schema.layout ?? "wgsl";

    if (throwError) {
        return getStructLayoutInternalImpl(schema, layout, true);
    }
    return getStructLayoutInternal({ schema, layout });
}
