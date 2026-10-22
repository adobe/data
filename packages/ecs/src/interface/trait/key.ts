// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Traits } from './types.js';

export type Key = keyof Traits<never>;

/** The core's traits, the only ones named by strings. */
export type BuiltIn = "type" | "derived" | "within" | "reference" | "reduce" | "thread" | "transfer";
