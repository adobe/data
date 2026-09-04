// © 2026 Adobe. MIT License. See /LICENSE for details.

import { F32 } from "../f32/index.js";
import { Schema } from "../../schema/index.js";

export const schema = {
    type: 'array',
    items: F32.schema,
    minItems: 4,
    maxItems: 4,
    default: [0, 0, 0, 1], // identity quaternion
    // "slerp" (spherical linear interpolation) — the animation system resolves
    // this name to Quat.slerp so quaternion tracks interpolate on the 4-sphere.
    interpolators: {
        linear: "slerp",
    },
} as const satisfies Schema;

