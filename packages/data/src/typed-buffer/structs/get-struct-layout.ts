// © 2026 Adobe. MIT License. See /LICENSE for details.
import { I32 } from "../../math/i32/index.js";
import { type Schema } from "../../schema/index.js";
import { U32 } from "../../math/u32/index.js";
import type { StructFieldPrimitiveType, StructLayout, Layout } from "./struct-layout.js";

// Layout rules for different memory layouts
const LAYOUT_RULES: { [K in Layout]: { vecAlign: number; structAlign: number; arrayAlign: number } } = {
    "std140": {
        vecAlign: 16,      // vec4 alignment
        structAlign: 16,   // struct alignment
        arrayAlign: 16     // array element alignment
    },
    "packed": {
        vecAlign: 4,       // minimal alignment for vertex buffers
        structAlign: 1,    // no struct padding
        arrayAlign: 1      // tight packing
    }
} as const;


/**
 * Gets alignment in bytes for a field within a struct
 */
const getStructFieldAlignment = (
    type: StructFieldPrimitiveType | StructLayout, 
    layout: Layout
): number => {
    // Primitive types are always 4-byte aligned
    if (typeof type === "string") {
        return 4;
    }
    // Arrays and structs alignment depends on layout mode
    return type.type === "array" 
        ? LAYOUT_RULES[layout].arrayAlign 
        : LAYOUT_RULES[layout].structAlign;
};

/**
 * Gets size in bytes for a field type
 */
const getFieldSize = (type: StructFieldPrimitiveType | StructLayout): number => {
    if (typeof type === "string") {
        return 4;  // All primitives are 4 bytes
    }
    // For arrays and structs, use their actual size
    return type.size;
};

/**
 * Gets stride in bytes for an array element type
 */
const getArrayElementStride = (
    type: StructFieldPrimitiveType | StructLayout, 
    layout: Layout
): number => {
    // For primitives in arrays, use 4 bytes
    if (typeof type === "string") {
        return 4;
    }
    // For structs and arrays, alignment depends on layout mode
    if (layout === "packed") {
        return type.size; // tight packing
    }
    // std140: round up to vec4
    return roundUpToAlignment(type.size, LAYOUT_RULES.std140.vecAlign);
};

/**
 * Gets alignment for array elements
 */
const getArrayElementAlignment = (
    type: StructFieldPrimitiveType | StructLayout, 
    layout: Layout
): number => {
    if (typeof type === "string") {
        return 4;  // Primitives use natural alignment
    }
    return LAYOUT_RULES[layout].arrayAlign;
};

/**
 * Rounds up to the next multiple of alignment
 */
const roundUpToAlignment = (offset: number, alignment: number): number => {
    return Math.ceil(offset / alignment) * alignment;
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

/**
 * Analyzes a Schema and returns a StructLayout.
 * Returns null if schema is not a valid struct schema.
 */
// The value an unwritten struct field reads back as: zeros of the field's shape.
const zeroValue = (type: StructFieldPrimitiveType | StructLayout): unknown => {
    if (typeof type === "string") return 0;
    if (type.type === "array") {
        return Object.keys(type.fields).sort((a, b) => +a - +b).map((index) => zeroValue(type.fields[index]!.type));
    }
    return Object.fromEntries(Object.entries(type.fields).map(([name, field]) => [name, zeroValue(field.type)]));
};

const deepFreeze = <T>(value: T): T => {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) deepFreeze(child);
        Object.freeze(value);
    }
    return value;
};

// Memoized per schema object and layout mode, so one schema always yields the same
// layout and the read/write factories memoized on that layout compile once.
const layoutCache = new WeakMap<Schema, Partial<Record<Layout, StructLayout | null>>>();
const getStructLayoutInternal = ({ schema, layout }: { schema: Schema; layout: Layout }): StructLayout | null => {
    let byLayout = layoutCache.get(schema);
    if (byLayout === undefined) layoutCache.set(schema, (byLayout = {}));
    const cached = byLayout[layout];
    if (cached !== undefined) return cached;
    return (byLayout[layout] = getStructLayoutInternalImpl(schema, layout, false));
};

const getStructLayoutInternalImpl = (schema: Schema, layout: Layout = "std140", throwsOnError: boolean = false): StructLayout | null => {
    // Handle root array/tuple case
    if (schema.type === "array") {
        if (!schema.items || Array.isArray(schema.items)) {
            if (throwsOnError) throw new Error("Array schema must have single item type");
            return null;
        }
        if (schema.minItems !== schema.maxItems || !schema.minItems) {
            if (throwsOnError) throw new Error("Array must have fixed length");
            return null;
        }
        if (schema.minItems < 1) {
            if (throwsOnError) throw new Error("Array length must be at least 1");
            return null;
        }

        // Special case for vec3
        const primitiveType = getPrimitiveType(schema.items);
        if (primitiveType && schema.minItems === 3) {
            const fields: StructLayout["fields"] = {};
            for (let i = 0; i < 3; i++) {
                fields[i.toString()] = {
                    offset: i * 4,
                    type: primitiveType
                };
            }
            return {
                type: "array",
                size: 12,  // vec3 is 12 bytes, not padded to vec4
                fields,
                layout
            };
        }

        // Regular array case
        const fields: StructLayout["fields"] = {};
        const elementType = primitiveType ?? getStructLayoutInternal({ schema: schema.items, layout });
        if (!elementType) {
            if (throwsOnError) throw new Error("Array element type is not a valid struct type");
            return null;
        }
        let currentOffset = 0;

        // Arrays are aligned according to layout rules
        const arrayAlign = LAYOUT_RULES[layout].arrayAlign;
        currentOffset = roundUpToAlignment(currentOffset, arrayAlign);
        const elementAlignment = getArrayElementAlignment(elementType, layout);
        const stride = getArrayElementStride(elementType, layout);

        for (let i = 0; i < schema.minItems; i++) {
            // Align each element according to its type
            currentOffset = roundUpToAlignment(currentOffset, elementAlignment);
            fields[i.toString()] = {
                offset: currentOffset,
                type: elementType
            };
            currentOffset += stride;
        }

        // Total size must be rounded up to alignment
        const finalAlign = layout === "packed" ? 1 : arrayAlign;
        const size = roundUpToAlignment(currentOffset, finalAlign);
        return {
            type: "array",
            size,
            fields,
            layout
        };
    }

    // Handle object case
    if (schema.type !== "object" || !schema.properties) {
        if (throwsOnError) throw new Error("Schema must be an object type with properties definition");
        return null;
    }

    const fields: StructLayout["fields"] = {};
    let currentOffset = 0;
    // Without `required`, every property is optional (as in `Schema.ToType`).
    const required = schema.required ? new Set(schema.required) : undefined;

    // First pass: create all fields and calculate alignments
    for (const [name, fieldSchema] of Object.entries(schema.properties)) {
        const primitiveType = getPrimitiveType(fieldSchema);
        const fieldType = primitiveType ?? getStructLayoutInternal({ schema: fieldSchema, layout });
        if (!fieldType) {
            if (throwsOnError) throw new Error(`Field "${name}" is not a valid struct type`);
            return null;
        }
        const alignment = getStructFieldAlignment(fieldType, layout);

        // Align field to its required alignment
        currentOffset = roundUpToAlignment(currentOffset, alignment);
        fields[name] = required?.has(name)
            ? { offset: currentOffset, type: fieldType }
            : { offset: currentOffset, type: fieldType, fill: deepFreeze(structuredClone(fieldSchema.default ?? zeroValue(fieldType))) };
        currentOffset += getFieldSize(fieldType);
    }

    // Round up total size according to layout rules
    const finalAlign = layout === "packed" ? 1 : LAYOUT_RULES.std140.structAlign;
    const size = roundUpToAlignment(currentOffset, finalAlign);
    return {
        type: "object",
        size,
        fields,
        layout
    };
};

export function getStructLayout(schema: Schema): StructLayout
export function getStructLayout(schema: Schema, throwError: boolean): StructLayout | null
export function getStructLayout(
    schema: Schema, 
    throwError: boolean = true
): StructLayout | null {
    // Read layout from schema with fallback to "std140"
    const layout = schema.layout ?? "std140";
    
    // Always return the memoized layout, so the read/write factories memoized on it are
    // reused; only an invalid schema reruns the implementation to throw its reason.
    const result = getStructLayoutInternal({ schema, layout });
    if (result !== null || !throwError) return result;
    return getStructLayoutInternalImpl(schema, layout, true);
}