// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { CoreDatabase } from "../core/core-database.js";

// Return the counter to zero and log the reset.
export const reset = (t: CoreDatabase.Store) => {
  t.resources.count = 0;
  t.resources.log = [...t.resources.log, "Reset to 0"];
};
