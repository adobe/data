// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Assert, Equal } from "@adobe/data/types";
import { Schema } from "@adobe/data/schema";
import type { Level } from "./level.js";
import { Lane } from "../lane/lane.js";
import { HazardKind } from "../hazard-kind/hazard-kind.js";

export const schema = {
  type: "object",
  properties: {
    width: { type: "integer", minimum: 1 },
    height: { type: "integer", minimum: 1 },
    lanes: { type: "array", items: Lane.schema },
    hazards: {
      type: "array",
      items: {
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
      },
    },
    lives: { type: "integer", minimum: 1 },
  },
  required: ["width", "height", "lanes", "hazards", "lives"],
  additionalProperties: false,
} as const satisfies Schema;

type _Pin = Assert<Equal<Schema.ToType<typeof schema>, Level>>;
