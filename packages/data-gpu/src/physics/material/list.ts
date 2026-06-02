// © 2026 Adobe. MIT License. See /LICENSE for details.

import { schema } from "./schema.js";

/**
 * Stable material order — the schema's enum is the single source of truth. The
 * index into this array is what the GPU stores per body and indexes the
 * material-properties buffer by.
 */
export const list = schema.enum;
