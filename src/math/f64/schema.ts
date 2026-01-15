// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "../../schema/index.js";

export const schema = {
    type: 'number',
    precision: 2,
    default: 0 as number,
} as const satisfies Schema;
