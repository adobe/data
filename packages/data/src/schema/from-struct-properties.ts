// © 2026 Adobe. MIT License. See /LICENSE for details.

import { assertStruct } from "../typed-buffer/structs/assert-struct.js";
import { Schema } from "./schema.js";
import { fromObjectProperties } from "./from-object-properties.js";

export function fromStructProperties<
  const P extends { readonly [K in string]: Schema },
>(properties: P) {
  return assertStruct(fromObjectProperties(properties));
}
