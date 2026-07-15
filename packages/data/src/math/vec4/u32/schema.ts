// © 2026 Adobe. MIT License. See /LICENSE for details.

import { U32 } from "../../u32/index.js";
import { Schema } from "../../../schema/index.js";

export const schema = {
    type: 'array',
    items: U32.schema,
    minItems: 4,
    maxItems: 4,
    default: [0, 0, 0, 0],
} as const satisfies Schema;
