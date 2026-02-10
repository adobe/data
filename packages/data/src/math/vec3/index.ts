// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "../../schema/index.js";
import { schema } from "./schema.js";

export type Vec3 = Schema.ToType<typeof schema>;

export * as Vec3 from "./public.js";
