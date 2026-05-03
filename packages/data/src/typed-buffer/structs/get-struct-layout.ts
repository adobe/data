// © 2026 Adobe. MIT License. See /LICENSE for details.
import { memoizeFactory } from "../../internal/function/memoize-factory.js";
import { I32 } from "../../math/i32/index.js";
import { type Schema } from "../../schema/index.js";
import { U32 } from "../../math/u32/index.js";
import type { StructFieldPrimitiveType, StructLayout, Layout } from "./struct-layout.js";

/**
 * Two layouts, both modelling real WebGPU buffer types:
 *
 * - "storage" (default) — WGSL host-shareable rules used by `var<storage>` (and `var<uniform>`
 *   structs without arrays). vec2 aligns to 8, vec3/vec4 align to 16, struct alignment is the
 *   max alignment of any member, and struct size is rounded up to that alignment so
 *   `array<T>` element strides match WGSL.
 * - "packed" — tight 4-byte packing for vertex buffer attribute streams. Vertex pipelines
 *   describe attribute offsets explicitly so structs need no GPU-imposed alignment.
 */

const roundUp = (value: number, alignment: number): number =>
    Math.ceil(value / alignment) * alignment;

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
 * Detect a WGSL vector: an array of 2/3/4 primitive scalars.
 */
const detectVector = (schema: Schema): { primitive: StructFieldPrimitiveType; n: 2 | 3 | 4 } | null => {
    if (schema.type !== "array" || !schema.items || Array.isArray(schema.items)) return null;
    if (schema.minItems !== schema.maxItems) return null;
    const n = schema.minItems;
    if (n !== 2 && n !== 3 && n !== 4) return null;
    const primitive = getPrimitiveType(schema.items);
    if (!primitive) return null;
    return { primitive, n: n as 2 | 3 | 4 };
};

const vectorAlign = (n: 2 | 3 | 4, layout: Layout): number =>
    layout === "packed" ? 4 : (n === 2 ? 8 : 16);

const vectorSize = (n: 2 | 3 | 4): number => n * 4;

const sizeOfType = (type: StructFieldPrimitiveType | StructLayout): number =>
    typeof type === "string" ? 4 : type.size;

const alignOfType = (type: StructFieldPrimitiveType | StructLayout, layout: Layout): number => {
    if (typeof type === "string") return 4;
    if (layout === "packed") return 1;
    return type.align;
};

const getStructLayoutInternal = memoizeFactory(
    ({ schema, layout }: { schema: Schema; layout: Layout }): StructLayout | null => getStructLayoutInternalImpl(schema, layout, false)
);

const getStructLayoutInternalImpl = (
    schema: Schema,
    layout: Layout = "storage",
    throwsOnError: boolean = false,
): StructLayout | null => {
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

        const vector = detectVector(schema);
        if (vector) {
            const align = vectorAlign(vector.n, layout);
            const size = vectorSize(vector.n);
            const fields: StructLayout["fields"] = {};
            for (let i = 0; i < vector.n; i++) {
                fields[i.toString()] = { offset: i * 4, type: vector.primitive };
            }
            return { type: "array", size, align, fields, layout };
        }

        const primitive = getPrimitiveType(schema.items);
        const elementType: StructFieldPrimitiveType | StructLayout | null =
            primitive ?? getStructLayoutInternal({ schema: schema.items, layout });
        if (!elementType) {
            if (throwsOnError) throw new Error("Array element type is not a valid struct type");
            return null;
        }

        const elementAlign = alignOfType(elementType, layout);
        const elementSize = sizeOfType(elementType);
        const stride = layout === "packed" ? elementSize : roundUp(elementSize, elementAlign);

        const fields: StructLayout["fields"] = {};
        let offset = 0;
        for (let i = 0; i < schema.minItems; i++) {
            fields[i.toString()] = { offset, type: elementType };
            offset += stride;
        }

        const align = layout === "packed" ? 1 : elementAlign;
        const size = layout === "packed" ? offset : roundUp(offset, align);
        return { type: "array", size, align, fields, layout };
    }

    if (schema.type !== "object" || !schema.properties) {
        if (throwsOnError) throw new Error("Schema must be an object type with properties definition");
        return null;
    }

    const fields: StructLayout["fields"] = {};
    let offset = 0;
    let maxAlign = 1;
    for (const [name, fieldSchema] of Object.entries(schema.properties)) {
        const primitive = getPrimitiveType(fieldSchema);
        const fieldType: StructFieldPrimitiveType | StructLayout | null =
            primitive ?? getStructLayoutInternal({ schema: fieldSchema, layout });
        if (!fieldType) {
            if (throwsOnError) throw new Error(`Field "${name}" is not a valid struct type`);
            return null;
        }

        const fieldAlign = alignOfType(fieldType, layout);
        offset = roundUp(offset, fieldAlign);
        fields[name] = { offset, type: fieldType };
        offset += sizeOfType(fieldType);
        if (fieldAlign > maxAlign) maxAlign = fieldAlign;
    }

    const align = layout === "packed" ? 1 : maxAlign;
    const size = layout === "packed" ? offset : roundUp(offset, align);
    return { type: "object", size, align, fields, layout };
};

export function getStructLayout(schema: Schema): StructLayout
export function getStructLayout(schema: Schema, throwError: boolean): StructLayout | null
export function getStructLayout(
    schema: Schema,
    throwError: boolean = true,
): StructLayout | null {
    const layout = schema.layout ?? "storage";

    if (throwError) {
        return getStructLayoutInternalImpl(schema, layout, true);
    } else {
        return getStructLayoutInternal({ schema, layout });
    }
}
