// © 2026 Adobe. MIT License. See /LICENSE for details.

import { F32 } from "../f32/index.js";
import { Schema } from "../../schema/index.js";

export const schema = {
    type: 'array',
    items: F32.schema,
    minItems: 3,
    maxItems: 3,
    default: [0, 0, 0],
} as const satisfies Schema;
