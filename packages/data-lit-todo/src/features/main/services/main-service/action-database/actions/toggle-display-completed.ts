// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../../service-database/service-database.js";

export const toggleDisplayCompleted = (db: ServiceDatabase) => {
  db.services.analytics.displayCompletedToggled();
  db.transactions.toggleDisplayCompleted();
};
