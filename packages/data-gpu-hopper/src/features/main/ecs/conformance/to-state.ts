// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "../../data/state/state.js";
import type { Frog } from "../../data/frog/frog.js";
import type { Hazard } from "../../data/hazard/hazard.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Read the single frog entity through the Frog archetype's full component set
// (`x`, `y`) — hazards lack `y`, so the shapes never alias.
const readFrog = (store: CoreDatabase.Store): Frog => {
  for (const arch of store.queryArchetypes(store.archetypes.Frog.components)) {
    for (let row = 0; row < arch.rowCount; row++) {
      return { x: arch.columns.x.get(row), y: arch.columns.y.get(row) };
    }
  }
  throw new Error("frog entity missing from store");
};

const readHazards = (store: CoreDatabase.Store): Hazard[] => {
  const hazards: Hazard[] = [];
  for (const arch of store.queryArchetypes(store.archetypes.Hazard.components)) {
    for (let row = 0; row < arch.rowCount; row++) {
      hazards.push({
        kind: arch.columns.kind.get(row),
        lane: arch.columns.lane.get(row),
        x: arch.columns.x.get(row),
        width: arch.columns.width.get(row),
        velocity: arch.columns.velocity.get(row),
      });
    }
  }
  return hazards;
};

// Read a store back into a `data/` `State` — the inverse of `fromState`. The
// scalar resources join the frog and the hazard entities. Test-only.
export const toState = (store: CoreDatabase.Store): State => ({
  width: store.resources.width,
  height: store.resources.height,
  lanes: store.resources.lanes,
  hazards: readHazards(store),
  frog: readFrog(store),
  lives: store.resources.lives,
  score: store.resources.score,
  status: store.resources.status,
});
