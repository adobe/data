// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";
import { LaneKind } from "../lane-kind/lane-kind.js";

// One board row: which row index it is, and its terrain type.
export const schema = {
  type: "object",
  properties: {
    row: { type: "integer", minimum: 0 },
    kind: LaneKind.schema,
  },
  required: ["row", "kind"],
  additionalProperties: false,
} as const satisfies Schema;
