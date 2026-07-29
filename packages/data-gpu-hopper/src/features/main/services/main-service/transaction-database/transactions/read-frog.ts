// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { CoreDatabase } from "../../core-database/core-database.js";

// The single frog entity — its id (to update) and current position. A read
// helper shared by the transactions here, so it stays OUT of the barrel (only
// dispatchable mutations belong there). Throws if the store has no frog, which
// is an invariant violation, not bad input.
export const readFrog = (t: CoreDatabase.Store) => {
  for (const arch of t.queryArchetypes(t.archetypes.Frog.components)) {
    for (let row = 0; row < arch.rowCount; row++) {
      return {
        id: arch.columns.id.get(row),
        frog: { x: arch.columns.x.get(row), y: arch.columns.y.get(row) },
      };
    }
  }
  throw new Error("frog entity missing from store");
};
