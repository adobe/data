// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "./schema.js";

export function Tuple<T extends Schema, N extends number>(items: T, length: N) {
  return { type: "array", items, minItems: length, maxItems: length } as const satisfies Schema;
}
