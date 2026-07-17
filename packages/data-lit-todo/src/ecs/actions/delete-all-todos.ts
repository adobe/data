// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../service-database.js";

export const deleteAllTodos = (db: ServiceDatabase) => {
  db.services.todoAnalytics.record("deleteAllTodos");
  db.transactions.deleteAllTodos();
};
