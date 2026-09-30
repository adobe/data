// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { ServiceDatabase } from "../services/service-database.js";

export const deleteTodo = (db: ServiceDatabase, { id }: { id: Entity }) => {
  db.services.analytics.todoDeleted();
  db.transactions.deleteTodo({ id });
};
