// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "../schema/index.js";

export type ResourceSchema = Schema & { default: unknown }

export type ResourceSchemas = { readonly [K: string]: ResourceSchema };
