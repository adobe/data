// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";
import { schema } from "./schema.js";

export type Bullet = Schema.ToType<typeof schema>;
export * as Bullet from "./public.js";
