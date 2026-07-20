// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { CoreDatabase } from "../core-database.js";

export const toggleDisplayCompleted = (t: CoreDatabase.Store) => {
  t.resources.displayCompleted = !t.resources.displayCompleted;
};
