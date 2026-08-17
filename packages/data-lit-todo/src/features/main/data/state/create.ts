// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "@adobe/data/ecs";
import type { State } from "./state.js";
import type { Todo } from "../todo/todo.js";

// The default application state: no todos, completed items hidden, nothing selected.
// It is the baseline the conformance cases author their `before`/`input` as deltas
// over (passed to the runners as `initial`), and the state a fresh app starts in.
export const create = (): State => ({
  displayCompleted: false,
  entities: new Map<number, Todo>(),
  selectedTodo: Entity.none,
});
