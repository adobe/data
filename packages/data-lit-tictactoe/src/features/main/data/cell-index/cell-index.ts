// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";
import { schema } from "./schema.js";

export type CellIndex = Schema.ToType<typeof schema>;
export * as CellIndex from "./public.js";
