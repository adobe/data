// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";
import { schema } from "./schema.js";

export type Direction = Schema.ToType<typeof schema>;
export * as Direction from "./public.js";
