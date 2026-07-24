// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Compile-time type checks for Schema.fromStructProperties.
// Compiled by tsc (not vitest). Each check is isolated in its own function so
// a failure in one does not degrade inference for the others.

import { U32, Vec3 } from "../math/index.js";
import type { Assert } from "../types/assert.js";
import type { Equal } from "../types/equal.js";
import { Schema } from "./index.js";

function fromStructProperties() {
  const schema = Schema.fromStructProperties({ a: Vec3.schema, b: U32.schema });

  type _Type = Assert<Equal<typeof schema.type, "object">>;
  type _Properties = Assert<Equal<
    typeof schema.properties,
    { readonly a: typeof Vec3.schema; readonly b: typeof U32.schema }
  >>;
  type _RequiredKeys = Assert<
    Equal<(typeof schema.required)[number], "a" | "b">
  >;
}
