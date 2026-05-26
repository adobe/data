// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "@adobe/data/schema";

/**
 * Default linear interpolation when a schema does not declare its own
 * `interpolators.linear`. Walks the schema once and lerps numeric leaves.
 * Supports `type: "number"` scalars and `type: "array"` of numbers.
 */
export function componentwiseLerp(schema: Schema, prev: any, next: any, t: number): any {
    if (schema.type === "number") {
        return prev + (next - prev) * t;
    }
    if (schema.type === "array") {
        const n = prev.length;
        const out = new Array(n);
        const itemSchema = schema.items ?? { type: "number" };
        for (let i = 0; i < n; i++) {
            out[i] = componentwiseLerp(itemSchema, prev[i], next[i], t);
        }
        return out;
    }
    throw new Error(`componentwiseLerp: no default interpolator for schema type "${schema.type}"`);
}
