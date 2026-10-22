// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Schema } from "../../schema/schema.js";

export const schema = { type: "integer", minimum: -2147483648, maximum: 2147483647 } as const satisfies Schema;
