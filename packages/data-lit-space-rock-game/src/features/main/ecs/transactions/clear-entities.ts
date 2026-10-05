// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { CoreDatabase } from "../core/core-database.js";

// Remove every bullet and asteroid (both carry `position`, so one query covers
// them). Iterate tail→head so each delete is from the tail: no hole-fill shift, and
// indices ahead of the cursor stay valid.
export const clearEntities = (t: CoreDatabase.Store): void => {
  for (const arch of t.queryArchetypes(["position"])) {
    for (let row = arch.rowCount - 1; row >= 0; row--) {
      t.delete(arch.columns.id.get(row));
    }
  }
};
