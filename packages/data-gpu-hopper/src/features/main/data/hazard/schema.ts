// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";
import { HazardKind } from "../hazard-kind/hazard-kind.js";

// A moving obstacle occupying one lane (row): its left edge `x` (continuous
// column), `width` in cells, and signed `velocity` in cells/second. Identity is
// the ECS entity itself, so there is no logical id field to mirror.
export const schema = {
  type: "object",
  properties: {
    kind: HazardKind.schema,
    lane: { type: "integer", minimum: 0 },
    x: { type: "number" },
    width: { type: "number", minimum: 0 },
    velocity: { type: "number" },
  },
  required: ["kind", "lane", "x", "width", "velocity"],
  additionalProperties: false,
} as const satisfies Schema;
