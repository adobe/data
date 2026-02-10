// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";

import { type TodoStore } from '../create-todo-store.js';

export const toggleComplete = (t: TodoStore, id: Entity) => {
  t.undoable = { coalesce: false };
  const todo = t.read(id);
  // actions must never throw errors.
  // if state is invalid they must no op.
  // this is important for resolving concurrency conflicts.
  if (todo) {
    t.update(id, { complete: !todo.complete });
  }
};
