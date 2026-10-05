// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { CoreDatabase } from "../core/core-database.js";

// Empty the activity log.
export const clearLog = (t: CoreDatabase.Store) => {
  t.resources.log = [];
};
