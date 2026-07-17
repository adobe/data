// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { ServiceDatabase } from "../service-database.js";

export const toggleComplete = (db: ServiceDatabase, id: Entity) => {
  db.services.todoAnalytics.record("toggleComplete", { id });
  db.transactions.toggleComplete(id);
};
