// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Operation } from "./operation.js";
import { schema } from "./schema.js";

export const values: readonly Operation[] = schema.enum;
