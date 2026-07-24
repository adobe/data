// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";

// The frog's fate on a given board this frame:
//   safe    — standing on solid terrain (grass / goal / a road tile with no car)
//   ride    — carried along by the log it is standing on
//   collide — touched a car
//   drown   — over open water with no log (or carried off the board edge)
//   win     — reached the goal row
export const schema = {
  type: "string",
  enum: ["safe", "ride", "collide", "drown", "win"],
  default: "safe",
} as const satisfies Schema;
