// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "../schema.js";

export const schema = {
    type: 'string',
    pattern: '^[0-9A-Za-z]+$',
} as const satisfies Schema;
