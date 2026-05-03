// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "../../schema/index.js";
import { schema } from "./schema.js";

export type I8 = Schema.ToType<typeof schema>;

export * as I8 from "./public.js";
