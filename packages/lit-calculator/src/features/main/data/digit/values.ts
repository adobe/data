// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Digit } from "./digit.js";
import { schema } from "./schema.js";

export const values: readonly Digit[] = schema.enum;
