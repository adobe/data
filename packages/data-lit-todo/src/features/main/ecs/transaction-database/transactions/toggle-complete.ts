// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { PersistentDatabase } from "../../persistent-database/persistent-database.js";

export const toggleComplete = (t: PersistentDatabase.Store, id: Entity) => {
  const todo = t.read(id);
  if (todo) {
    t.update(id, { complete: !todo.complete });
  }
};
