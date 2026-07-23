// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";
import { Vec2, F32 } from "@adobe/data/math";

// A fired bullet: position, constant-speed velocity, and how many seconds it
// has been alive (`age`, used to expire it). Every field is a 32-bit number or
// numeric sub-struct, so it uses `fromStructProperties` — a guaranteed-valid
// struct schema stored in linear memory.
export const schema = Schema.fromStructProperties({
  position: Vec2.schema,
  velocity: Vec2.schema,
  age: F32.schema,
});
