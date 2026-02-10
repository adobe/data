// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "../../schema/index.js";
import { schema } from "./schema.js";

export type I32 = Schema.ToType<typeof schema>;

export * as I32 from "./public.js";
