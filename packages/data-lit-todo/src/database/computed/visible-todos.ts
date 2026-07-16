// © 2026 Adobe. MIT License. See /LICENSE for details.
import { cached } from "@adobe/data/cache";
import { Observe } from "@adobe/data/observe";
import { Todo } from "../../types/todo/todo.js";
import type { IndexDatabase } from "../index-database.js";
import { allTodos } from "./all-todos.js";
import { incompleteTodos } from "./incomplete-todos.js";

export const visibleTodos = cached((db: IndexDatabase) =>
  Observe.withFilter(
    Observe.fromProperties({
      displayCompleted: db.observe.resources.displayCompleted,
      allTodos: allTodos(db),
      incompleteTodos: incompleteTodos(db),
    }),
    Todo.selectVisible,
  ),
);
