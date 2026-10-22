// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Layout } from "../../schema/index.js";

export type { Layout };
export type StructFieldPrimitiveType = "i32" | "u32" | "f32";

/**
 * Layout for struct fields
 */
export interface StructLayoutField {
    offset: number;
    type: StructFieldPrimitiveType | StructLayout;
    /**
     * Present on an object field that is not `required`: the value written when the
     * field is absent (its schema `default`, else zeros). A struct stores every field,
     * so an omitted one reads back as this value.
     */
    fill?: unknown;
}

/**
 * Layout for struct types
 */
export interface StructLayout {
    type: "object" | "array";
    /** Total size including padding in bytes */
    size: number;
    /** Fields for struct types */
    fields: Record<string, StructLayoutField>;
    /** Layout mode used for generating this layout */
    layout?: Layout;
}