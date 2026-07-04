// © 2026 Adobe. MIT License. See /LICENSE for details.

import { I32 } from "../../i32/index.js";
import { Schema } from "../../../schema/index.js";

export const schema = {
    type: 'array',
    items: I32.schema,
    minItems: 2,
    maxItems: 2,
    default: [0, 0],
} as const satisfies Schema;
