// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "../../schema/index.js";
import { U32 } from "../../math/u32/index.js";

export const EntityLocationSchema = {
    type: "object",
    properties: {
        archetype: U32.schema,
        row: U32.schema
    },
    required: ["archetype", "row"],
    additionalProperties: false,
} as const satisfies Schema;

export type EntityLocation = Schema.ToType<typeof EntityLocationSchema>;
