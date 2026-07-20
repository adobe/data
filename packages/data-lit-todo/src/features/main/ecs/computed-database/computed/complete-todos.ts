// © 2026 Adobe. MIT License. See /LICENSE for details.
import { cached } from "@adobe/data/cache";
import type { IndexDatabase } from "../../index-database/index-database.js";

export const completeTodos = cached((db: IndexDatabase) =>
  db.observe.select(db.archetypes.Todo.components, {
    where: { complete: true },
    order: { order: true },
  }),
);
