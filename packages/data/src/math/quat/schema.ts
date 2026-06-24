// © 2026 Adobe. MIT License. See /LICENSE for details.

import { F32 } from "../f32/index.js";
import { Schema } from "../../schema/index.js";
import { slerp } from "./functions.js";

export const schema = {
    type: 'array',
    items: F32.schema,
    minItems: 4,
    maxItems: 4,
    default: [0, 0, 0, 1], // identity quaternion
    interpolators: {
        linear: slerp,
    },
} as const satisfies Schema;

