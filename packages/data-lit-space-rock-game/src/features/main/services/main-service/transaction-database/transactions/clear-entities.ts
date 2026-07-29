// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { CoreDatabase } from "../../core-database/core-database.js";

// Remove every entity — ship, asteroids, and bullets all carry `position`, so
// one query covers them. Every row migrates out, so iterate tail→head: each
// delete is from the tail, so there is no hole-fill shift and indices ahead of
// the cursor stay valid.
export const clearEntities = (t: CoreDatabase.Store): void => {
  for (const arch of t.queryArchetypes(["position"])) {
    for (let row = arch.rowCount - 1; row >= 0; row--) {
      t.delete(arch.columns.id.get(row));
    }
  }
};
