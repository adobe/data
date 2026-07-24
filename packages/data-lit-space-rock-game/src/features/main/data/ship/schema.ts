// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";
import { Vec2, F32 } from "@adobe/data/math";

// The player ship: where it is, how fast it drifts, and which way it points
// (`rotation` in radians; velocity persists as momentum between ticks). Every
// field is a 32-bit number or numeric sub-struct, so it uses
// `fromStructProperties` — a guaranteed-valid struct schema stored in linear
// memory.
export const schema = Schema.fromStructProperties({
  position: Vec2.schema,
  velocity: Vec2.schema,
  rotation: F32.schema,
});
