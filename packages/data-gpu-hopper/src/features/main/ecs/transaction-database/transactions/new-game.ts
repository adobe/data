// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "../../../data/state/state.js";
import type { CoreDatabase } from "../../core-database/core-database.js";

// Reset the whole store to the initial game (see State.create): clear the frog
// and every hazard, restore the scalar resources and terrain, then insert the
// starting frog and hazards.
export const newGame = (t: CoreDatabase.Store) => {
  const initial = State.create();

  for (const arch of t.queryArchetypes(t.archetypes.Frog.components)) {
    for (let row = arch.rowCount - 1; row >= 0; row--) t.delete(arch.columns.id.get(row));
  }
  for (const arch of t.queryArchetypes(t.archetypes.Hazard.components)) {
    for (let row = arch.rowCount - 1; row >= 0; row--) t.delete(arch.columns.id.get(row));
  }

  t.resources.width = initial.width;
  t.resources.height = initial.height;
  t.resources.lives = initial.lives;
  t.resources.score = initial.score;
  t.resources.status = initial.status;
  t.resources.lanes = initial.lanes;

  t.archetypes.Frog.insert({ x: initial.frog.x, y: initial.frog.y });
  for (const hazard of initial.hazards) {
    t.archetypes.Hazard.insert(hazard);
  }
};
