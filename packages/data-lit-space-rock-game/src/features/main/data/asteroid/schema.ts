// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";
import { Vec2 } from "@adobe/data/math";
import { Size } from "../size/size.js";

// A drifting asteroid: position, constant velocity, and its size tier (which
// determines radius, score, and how it splits).
export const schema = Schema.fromObjectProperties(
  { position: Vec2.schema, velocity: Vec2.schema, size: Size.schema },
  ["position", "velocity", "size"],
);
