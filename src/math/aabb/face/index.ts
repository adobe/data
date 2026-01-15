// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "../../../schema/index.js";
import { schema } from "./schema.js";

export type AabbFace = Schema.ToType<typeof schema>;

export * from "./public.js";
