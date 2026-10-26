// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Schema } from "../../schema/schema.js";
import type { schema } from "./schema.js";

/** Integers in [-2^31, 2^31). Functions wrap as WGSL's i32 does; for other values their results are indeterminate. */
export type I32 = Schema.Type<typeof schema>;

export * as I32 from "./public.js";
