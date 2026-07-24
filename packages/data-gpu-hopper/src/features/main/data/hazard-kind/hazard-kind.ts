// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";
import { schema } from "./schema.js";

export type HazardKind = Schema.ToType<typeof schema>;
export * as HazardKind from "./public.js";
