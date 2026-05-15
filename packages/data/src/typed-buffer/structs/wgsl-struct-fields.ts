// © 2026 Adobe. MIT License. See /LICENSE for details.

import { type Schema } from "../../schema/index.js";

const primitiveWgslType = (schema: Schema): string | null => {
    if (schema.type === "number") return "f32";
    if (schema.type === "integer") {
        return schema.minimum !== undefined && schema.minimum >= 0 ? "u32" : "i32";
    }
    return null;
};

const fieldWgslType = (schema: Schema): string | null => {
    const prim = primitiveWgslType(schema);
    if (prim) return prim;
    if (
        schema.type === "array" &&
        schema.items !== undefined &&
        !Array.isArray(schema.items) &&
        schema.minItems === schema.maxItems &&
        schema.minItems !== undefined
    ) {
        const elemType = primitiveWgslType(schema.items);
        if (!elemType) return null;
        const n = schema.minItems;
        const suffix = elemType === "f32" ? "f" : elemType === "i32" ? "i" : "u";
        if (n === 16 && suffix === "f") return "mat4x4f";
        if (n === 2 || n === 3 || n === 4) return `vec${n}${suffix}`;
    }
    return null;
};

/**
 * Generates WGSL struct field declarations from a JSON Schema object type.
 *
 * Maps each property to the appropriate WGSL type (f32, vec3f, mat4x4f, etc.)
 * using the same schema that drives host-side TypedBuffer layout — so the host
 * struct and the WGSL struct are guaranteed to agree on field order and types.
 *
 * Usage:
 * ```ts
 * const source = `
 * struct MyUniforms {
 * ${wgslStructFields(MyUniforms.schema)}
 * }`;
 * ```
 */
export const wgslStructFields = (schema: Schema): string => {
    if (schema.type !== "object" || !schema.properties) return "";
    return Object.entries(schema.properties)
        .map(([name, fieldSchema]) => {
            const type = fieldWgslType(fieldSchema);
            if (!type) throw new Error(`Cannot map schema field "${name}" to a WGSL type`);
            return `    ${name}: ${type},`;
        })
        .join("\n");
};
