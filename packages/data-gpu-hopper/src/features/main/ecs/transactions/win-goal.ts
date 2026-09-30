// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { CoreDatabase } from "../core/core-database.js";

// Score the reached goal and end the game as won. Dispatched by the collision system.
export const winGoal = (t: CoreDatabase.Store) => {
  t.resources.score = t.resources.score + 1;
  t.resources.status = "won";
};
