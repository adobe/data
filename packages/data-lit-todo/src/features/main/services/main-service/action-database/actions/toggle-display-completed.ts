// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../../service-database/service-database.js";

export const toggleDisplayCompleted = (db: ServiceDatabase) => {
  db.services.todoAnalytics.displayCompletedToggled();
  db.transactions.toggleDisplayCompleted();
};
