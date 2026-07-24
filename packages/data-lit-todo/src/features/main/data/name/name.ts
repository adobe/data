// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";
import { schema } from "./schema.js";

export type Name = Schema.ToType<typeof schema>;
export * as Name from "./public.js";
