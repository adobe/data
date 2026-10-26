// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Schema } from "../../../schema/schema.js";
import type { schema } from "./schema.js";

/** Vectors of integers in [0, 2^32). Functions wrap as WGSL's u32 does; for other values their results are indeterminate. */
export type U32 = Schema.Type<typeof schema>;

export * as U32 from "./public.js";
