// © 2026 Adobe. MIT License. See /LICENSE for details.

import { F32 } from "../f32/index.js";
import { Schema } from "../../schema/index.js";

export const schema = {
    type: 'array',
    items: F32.schema,
    minItems: 16,
    maxItems: 16,
    default: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], // identity matrix
} as const satisfies Schema;
