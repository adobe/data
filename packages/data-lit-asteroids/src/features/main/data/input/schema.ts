// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema, Boolean } from "@adobe/data/schema";
import { F32 } from "@adobe/data/math";

// The player's intent for one tick: which way to turn (-1 left, 0 none,
// +1 right), whether the thruster is on, and whether the trigger is pulled.
export const schema = Schema.fromObjectProperties(
  { turn: F32.schema, thrust: Boolean.schema, fire: Boolean.schema },
  ["turn", "thrust", "fire"],
);
