// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Parameter, Schema } from "./schema.js";

declare const parameter: Parameter;

// POSITIVE — the wrapped schema is a Schema.
export const inner: Schema = parameter.schema;

// @ts-expect-error — a Parameter is not the schema it wraps
export const wrapper: Schema = parameter;

import type { ToType } from "./to-type.js";
import type { Assert } from "../types/assert.js";
import type { Equal } from "../types/equal.js";

// POSITIVE — a signature may mix named Parameters and (deprecated) bare Schemas; both
// derive the same positional argument types.
type Mixed = ToType<{
  type: "function";
  signature: { parameters: [{ name: "a"; schema: { type: "number" } }, { type: "string" }] };
}>;
export type _Mixed = Assert<Equal<Mixed, (a: number, b: string) => void>>;
