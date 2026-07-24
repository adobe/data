// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Size } from "./size.js";
import { schema } from "./schema.js";

const set: ReadonlySet<unknown> = new Set(schema.enum);

export const is = (value: unknown): value is Size => set.has(value);
