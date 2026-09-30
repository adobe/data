// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { LaneKind } from "./lane-kind.js";
import type { Outcome } from "../outcome/outcome.js";

// The frog's fate on each terrain when a hazard DOES cover it. A car on a road
// collides; a log on the river carries the frog; grass and goal are unaffected.
export const coveredOutcome: Record<LaneKind, Outcome> = {
  grass: "safe",
  road: "collide",
  river: "ride",
  goal: "win",
};
