// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { DocumentDatabase } from "../../document-database/document-database.js";

export const toggleComplete = (t: DocumentDatabase.Store, id: Entity) => {
  const todo = t.read(id);
  if (todo) {
    t.update(id, { complete: !todo.complete });
  }
};
