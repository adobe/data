// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Services } from "../../services/services.js";
import type { State } from "./state.js";
import type { Todo } from "../todo/todo.js";

// Reads the entities, writes the entities — an `{ entities }` patch — clearing
// them; `displayCompleted` is untouched. Logs `allTodosCleared`.
export const deleteAllTodos = (
  state: Pick<State, "entities">,
  { analytics }: Pick<Services, "analytics">,
): Pick<State, "entities"> => {
  analytics.allTodosCleared();
  return { entities: new Map<number, Todo>() };
};
