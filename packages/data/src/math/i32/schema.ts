// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "../../schema/index.js";

export const schema = {
    type: 'integer',
    minimum: -2147483648,
    maximum: 2147483647,
    default: 0 as number,
} as const satisfies Schema;
