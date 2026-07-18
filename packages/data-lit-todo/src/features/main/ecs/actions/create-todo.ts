// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../service-database.js";

export const createTodo = (
  db: ServiceDatabase,
  input: { readonly name: string; readonly complete?: boolean },
) => {
  db.services.todoAnalytics.todoCreated({ name: input.name });
  db.transactions.createTodo(input);
};
