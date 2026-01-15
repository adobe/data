// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "../schema/index.js";
import { U32 } from "../math/u32/index.js";

export const RowIndexSchema = U32.schema;
export type RowIndex = Schema.ToType<typeof RowIndexSchema>;
