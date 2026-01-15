// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "../../schema/index.js";

export const schema = {
    type: 'integer',
    minimum: 0,
    maximum: 4294967295,
    default: 0 as number,
} as const satisfies Schema;
