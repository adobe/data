// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { ServiceDatabase } from "../../service-database/service-database.js";

export const deleteTodo = (db: ServiceDatabase, id: Entity) => {
  db.services.analytics.todoDeleted();
  db.transactions.deleteTodo(id);
};
