// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "./schema.js";

export function Nullable<T extends Schema>(
  schema: T
): { oneOf: [T, { type: "null" }] } {
  return {
    oneOf: [schema, { type: "null" }],
  };
}


