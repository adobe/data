// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "../../schema/index.js";
import { schema } from "./schema.js";

export type Vec2 = Schema.ToType<typeof schema>;

export * as Vec2 from "./public.js";
