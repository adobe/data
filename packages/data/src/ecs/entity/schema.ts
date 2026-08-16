// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "../../schema/index.js";
import { Assert } from "../../types/assert.js";
import { Equal } from "../../types/equal.js";
import { I32 } from "../../math/i32/index.js";

// An entity id is an i32 marked as an entity reference, so conformance testing can
// tell an id apart from a plain number (see `Schema.entity`). The mark is inert to
// storage and validation — an entity column is still an i32 column.
export const schema = { ...I32.schema, entity: true } as const satisfies Schema;

// The mark must not change the value type: an Entity is still a number.
type _Pin = Assert<Equal<Schema.ToType<typeof schema>, number>>;
