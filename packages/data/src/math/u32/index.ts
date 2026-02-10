// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "../../schema/index.js";
import { schema } from "./schema.js";

export type U32 = Schema.ToType<typeof schema>;

export * as U32 from "./public.js";
