// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Parameter, Schema } from "./schema.js";

declare const parameter: Parameter;

// POSITIVE — the wrapped schema is a Schema.
export const inner: Schema = parameter.schema;

// @ts-expect-error — a Parameter is not the schema it wraps
export const wrapper: Schema = parameter;
