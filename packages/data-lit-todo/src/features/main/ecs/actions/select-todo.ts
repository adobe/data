// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { ServiceDatabase } from "../services/service-database.js";

// Select a todo (a no-op for an id that names no todo).
export const selectTodo = (db: ServiceDatabase, { id }: { id: Entity }) => {
  db.transactions.selectTodo({ id });
};
