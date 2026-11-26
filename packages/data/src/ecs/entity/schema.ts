// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "../../schema/index.js";
import { Assert } from "../../types/assert.js";
import { Equal } from "../../types/equal.js";

// An entity id is a non-negative safe integer (a 32-bit slot plus a 21-bit
// generation; see `persistence-sharing.ts`), marked as an entity reference so
// conformance testing can tell an id apart from a plain number (see
// `Schema.entity`). The mark is inert to storage and validation; the range puts
// an entity column in a Float64Array.
export const schema = {
    type: "integer",
    minimum: 0,
    maximum: Number.MAX_SAFE_INTEGER,
    default: 0 as number,
    entity: true,
} as const satisfies Schema;

// The mark must not change the value type: an Entity is still a number.
type _Pin = Assert<Equal<Schema.ToType<typeof schema>, number>>;
