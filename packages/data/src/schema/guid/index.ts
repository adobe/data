// © 2026 Adobe. MIT License. See /LICENSE for details.

import { ToType } from "../to-type.js";
import { schema } from "./schema.js";

export type Guid = ToType<typeof schema>;

export * as Guid from "./public.js";
