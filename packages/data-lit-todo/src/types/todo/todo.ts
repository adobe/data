// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";
import { schema } from "./schema.js";

export type Todo = Schema.ToType<typeof schema>;
export * as Todo from "./public.js";
