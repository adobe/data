// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "../../schema/index.js";
import { schema } from "./schema.js";

export type Line2 = Schema.ToType<typeof schema>;

export * as Line2 from "./public.js";
