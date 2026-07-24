// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { LaneKind } from "./lane-kind.js";
import type { Outcome } from "../outcome/outcome.js";

// The frog's fate on each terrain when NO hazard covers it. Grass and roads are
// safe when empty; open water drowns; the goal is always a win.
export const emptyOutcome: Record<LaneKind, Outcome> = {
  grass: "safe",
  road: "safe",
  river: "drown",
  goal: "win",
};
