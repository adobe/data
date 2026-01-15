// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "../../../schema/index.js";

export const schema = {
    type: 'number',
    minimum: 1,
    maximum: 63,
} as const satisfies Schema;

