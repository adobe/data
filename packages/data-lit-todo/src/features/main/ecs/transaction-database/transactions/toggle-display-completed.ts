// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { SettingsDatabase } from "../../settings-database/settings-database.js";

export const toggleDisplayCompleted = (t: SettingsDatabase.Store) => {
  t.resources.displayCompleted = !t.resources.displayCompleted;
};
