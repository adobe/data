// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "@adobe/data/schema";
import type { InterpolationMode } from "./animation-types.js";
import { componentwiseLerp } from "./componentwise-lerp.js";

/**
 * Dispatches to a schema-declared interpolator if present, otherwise falls
 * back to a sensible default: `step` returns `next`, `linear` walks the schema
 * and lerps numeric leaves. `cubicSpline` requires a schema override.
 */
export function interpolate(
    schema: Schema,
    mode: InterpolationMode,
    prev: any,
    next: any,
    t: number,
): any {
    const custom = schema.interpolators?.[mode];
    if (custom) return custom(prev, next, t);
    if (mode === "step") return prev;
    if (mode === "linear") return componentwiseLerp(schema, prev, next, t);
    throw new Error(`interpolate: schema type "${schema.type}" has no "${mode}" interpolator`);
}
