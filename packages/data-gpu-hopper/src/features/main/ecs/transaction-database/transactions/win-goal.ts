// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "../../../data/state/state.js";
import type { CoreDatabase } from "../../core-database/core-database.js";

// Score the goal and win (see State.winGoal). A discrete atomic event — the
// collision system dispatches this (rather than writing resources directly) so
// observers such as the HUD update.
export const winGoal = (t: CoreDatabase.Store) => {
  const next = State.winGoal({ score: t.resources.score, status: t.resources.status });
  t.resources.score = next.score;
  t.resources.status = next.status;
};
