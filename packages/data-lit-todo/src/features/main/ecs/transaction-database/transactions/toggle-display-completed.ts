// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { SessionDatabase } from "../../session-database/session-database.js";

export const toggleDisplayCompleted = (t: SessionDatabase.Store) => {
  t.resources.displayCompleted = !t.resources.displayCompleted;
};
