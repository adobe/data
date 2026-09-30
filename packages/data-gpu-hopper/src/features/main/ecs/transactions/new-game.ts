// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Level } from "../../data/values/level/level.js";
import { Frog } from "../../data/values/frog/frog.js";
import type { CoreDatabase } from "../core/core-database.js";

// Reset the store to `Level.initial`: clear every hazard, restore the board and the
// run's scalars, then insert the starting hazards. Clears tail→head so each delete
// is from the tail.
export const newGame = (t: CoreDatabase.Store) => {
  const { width, height, lanes, hazards, lives } = Level.initial;
  for (const arch of t.queryArchetypes(t.archetypes.Hazard.components)) {
    for (let row = arch.rowCount - 1; row >= 0; row--) t.delete(arch.columns.id.get(row));
  }
  t.resources.width = width;
  t.resources.height = height;
  t.resources.lanes = lanes;
  t.resources.frog = Frog.start(width);
  t.resources.lives = lives;
  t.resources.score = 0;
  t.resources.status = "playing";
  for (const hazard of hazards) {
    t.archetypes.Hazard.insert({ nonPersistent: true, nonShared: true, ...hazard });
  }
};
