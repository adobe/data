// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Parameter, Schema } from "./schema.js";

// A signature entry is a named `Parameter`, or (deprecated) the bare Schema of a
// positional argument. Only a `Parameter` carries `schema` (`Schema.schema?: never`).
export const isNamed = (parameter: Parameter | Schema): parameter is Parameter => parameter.schema !== undefined;

// The argument's schema, whichever form the signature entry takes.
export const schemaOf = (parameter: Parameter | Schema): Schema => (isNamed(parameter) ? parameter.schema : parameter);
