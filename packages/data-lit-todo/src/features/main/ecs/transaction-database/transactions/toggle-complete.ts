// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { CoreDatabase } from "../../core-database/core-database.js";

export const toggleComplete = (t: CoreDatabase.Store, id: Entity) => {
  const todo = t.read(id);
  if (todo) {
    t.update(id, { complete: !todo.complete });
  }
};
