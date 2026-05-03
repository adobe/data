// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { StructFieldPrimitiveType, StructLayout } from "./struct-layout.js";

/** Primitive slot or nested layout — matches {@link StructLayoutField.type}. */
export type StructLayoutFieldType = StructFieldPrimitiveType | StructLayout;

/**
 * Returns true if assigning `value` to this layout would store only zero bits in every
 * touched primitive field (equivalent to memsetting the struct slot to 0 for semantic zeros).
 */
export function isStructLayoutZeroValue(layout: StructLayoutFieldType, value: unknown): boolean {
    if (typeof layout === "string") {
        return typeof value === "number" && value === 0 && !Number.isNaN(value);
    }

    if (layout.type === "object") {
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
            return false;
        }
        for (const [name, field] of Object.entries(layout.fields)) {
            if (!isStructLayoutZeroValue(field.type, Reflect.get(value, name))) {
                return false;
            }
        }
        return true;
    }

    if (!Array.isArray(value)) {
        return false;
    }
    const entries = Object.entries(layout.fields).sort((a, b) => +a[0] - +b[0]);
    for (const [key, field] of entries) {
        const index = +key;
        if (!isStructLayoutZeroValue(field.type, value[index])) {
            return false;
        }
    }
    return true;
}
