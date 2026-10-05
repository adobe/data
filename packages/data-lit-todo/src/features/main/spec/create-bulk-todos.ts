// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Services } from "../services/services.js";
import type { State } from "./state.js";
import { appendTodo } from "./append-todo.js";
/** Adds numbered placeholder todos for demos and performance testing. Reads and
 * writes the entities — an `{ entities }` patch. */
export const createBulkTodos = (
  state: Pick<State, "entities">,
  {
    count,
    analytics,
  }: { readonly count: number } & Pick<Services, "analytics">,
): Pick<State, "entities"> => {
  analytics.bulkTodosCreated({ count });
  const total = Math.max(0, Math.floor(count));
  let next: Pick<State, "entities"> = state;
  for (let index = 0; index < total; index++) {
    next = appendTodo(next, { name: `Todo ${state.entities.size + index}` });
  }
  return next;
};
