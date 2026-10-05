// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Frog } from "../data/values/frog/frog.js";
import { Lane } from "../data/values/lane/lane.js";
import { LaneKind } from "../data/values/lane-kind/lane-kind.js";
import type { Outcome } from "../data/values/outcome/outcome.js";
import type { State } from "./state.js";

// The frog's fate on the current board: its lane's terrain, and whether a hazard on
// that lane covers it. A frog carried off the board edge is covered by nothing.
export const frogOutcome = (state: Pick<State, "lanes" | "entities" | "frog" | "boardWidth">): Outcome => {
  const lane = Lane.at(state.lanes, state.frog.y);
  if (!lane) return "safe";
  const covered =
    Frog.onBoard(state.frog, state.boardWidth) &&
    [...state.entities.values()].some(
      (hazard) => hazard.lane === state.frog.y && Lane.coversAt(hazard.x, hazard.width, state.frog.x),
    );
  return LaneKind.outcome(lane.kind, covered);
};
