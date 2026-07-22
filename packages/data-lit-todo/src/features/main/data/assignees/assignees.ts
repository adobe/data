// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";
import { schema } from "./schema.js";

export type Assignees = Schema.ToType<typeof schema>;
export * as Assignees from "./public.js";
