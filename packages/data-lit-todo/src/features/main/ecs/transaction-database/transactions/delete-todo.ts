// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { PersistentDatabase } from "../../persistent-database/persistent-database.js";

export const deleteTodo = (t: PersistentDatabase.Store, id: Entity) => {
  const todo = t.read(id);
  if (todo) {
    t.delete(id);
  }
};
