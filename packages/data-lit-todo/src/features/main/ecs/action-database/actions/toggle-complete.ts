// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { ServiceDatabase } from "../../service-database/service-database.js";

export const toggleComplete = (db: ServiceDatabase, id: Entity) => {
  db.services.todoAnalytics.todoToggled();
  db.transactions.toggleComplete(id);
};
