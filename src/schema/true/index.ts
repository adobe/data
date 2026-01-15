// © 2026 Adobe. MIT License. See /LICENSE for details.

import { ToType } from "../to-type.js";
import { schema } from "./schema.js";

export type True = ToType<typeof schema>;

export * as True from "./public.js";
