// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../service-database.js";

export const createBulkTodos = (
  db: ServiceDatabase,
  input: { readonly count: number },
) => {
  db.services.todoAnalytics.record("createBulkTodos", { count: input.count });
  db.transactions.createBulkTodos(input);
};
