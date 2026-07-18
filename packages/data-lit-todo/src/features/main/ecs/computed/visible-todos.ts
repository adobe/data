// © 2026 Adobe. MIT License. See /LICENSE for details.
import { cached } from "@adobe/data/cache";
import { Observe } from "@adobe/data/observe";
import type { IndexDatabase } from "../index-database.js";
import { allTodos } from "./all-todos.js";
import { incompleteTodos } from "./incomplete-todos.js";

// Optimized, id-based equivalent of `State.visibleTodos` (verified by
// conformance test): the incomplete/all lists are already index-maintained,
// so visibility is a choice between two pre-sorted id lists.
export const visibleTodos = cached((db: IndexDatabase) =>
  Observe.withFilter(
    Observe.fromProperties({
      displayCompleted: db.observe.resources.displayCompleted,
      allTodos: allTodos(db),
      incompleteTodos: incompleteTodos(db),
    }),
    ({ displayCompleted, allTodos, incompleteTodos }) =>
      displayCompleted ? allTodos : incompleteTodos,
  ),
);
