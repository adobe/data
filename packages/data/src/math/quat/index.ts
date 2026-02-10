// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "../../schema/index.js";
import { schema } from "./schema.js";

export type Quat = Schema.ToType<typeof schema>;

export * as Quat from "./public.js";
