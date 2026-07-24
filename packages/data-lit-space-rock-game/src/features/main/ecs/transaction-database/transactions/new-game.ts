// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "../../../data/state/state.js";
import type { CoreDatabase } from "../../core-database/core-database.js";
import { clearEntities } from "./clear-entities.js";

// Start a fresh game on the current play-field. Thin wrapper over
// State.createInitial: clear every entity, reset the scalar resources, centre
// the ship, and spawn the first wave. `bounds` is preserved — it is set by the
// UI on canvas resize, not part of the reset.
export const newGame = (t: CoreDatabase.Store): void => {
  const initial = State.createInitial(t.resources.bounds);
  clearEntities(t);
  t.resources.score = initial.score;
  t.resources.lives = initial.lives;
  t.resources.wave = initial.wave;
  t.archetypes.Ship.insert(initial.ship);
  for (const asteroid of initial.asteroids) {
    t.archetypes.Asteroid.insert(asteroid);
  }
};
