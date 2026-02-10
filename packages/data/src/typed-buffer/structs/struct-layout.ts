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