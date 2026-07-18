// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";
import { schema } from "./schema.js";

export type DragPosition = Schema.ToType<typeof schema>;
export * as DragPosition from "./public.js";
