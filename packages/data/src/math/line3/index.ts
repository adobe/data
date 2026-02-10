// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "../../schema/index.js";
import { schema } from "./schema.js";

export type Line3 = Schema.ToType<typeof schema>;

export * as Line3 from "./public.js";
