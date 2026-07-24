// © 2026 Adobe. MIT License. See /LICENSE for details.
import { LaneKind } from "../lane-kind/lane-kind.js";
import { Hazard } from "../hazard/hazard.js";
import type { Outcome } from "../outcome/outcome.js";
import type { State } from "./state.js";
import { laneAt } from "./lane-at.js";

// The frog's fate given the current board. Terrain semantics (safe / collide /
// drown / ride / win) live on LaneKind as empty-vs-covered descriptors; this
// composes them with hazard coverage and an on-board test. A frog carried off
// the board edge is no longer "covered" by any hazard, so open water drowns it.
export const frogOutcome = <
  T extends Pick<State, "lanes" | "hazards" | "frog" | "width">,
>(
  state: T,
): Outcome => {
  const lane = laneAt(state, state.frog.y);
  if (!lane) return "safe";
  const onBoard = state.frog.x >= 0 && state.frog.x <= state.width - 1;
  const covered =
    onBoard &&
    state.hazards.some((hazard) => hazard.lane === state.frog.y && Hazard.covers(hazard, state.frog.x));
  return covered ? LaneKind.coveredOutcome[lane.kind] : LaneKind.emptyOutcome[lane.kind];
};
