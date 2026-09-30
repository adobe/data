// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Services } from "../services/services.js";
import type { State } from "./state.js";
import { appendTodo } from "./append-todo.js";
/**
 * Async, service-injected transition: brackets the slow name generation with
 * analytics timing, then appends the todo via the shared {@link appendTodo} (so
 * it does NOT fire `todoCreated` — it logs its own `randomTodoAdded`). Reads and
 * writes the entities — an `{ entities }` patch. Awaiting an async port makes it
 * `Promise<Pick<State, "entities">>`, but it stays deterministic given its
 * injected services — which is how it is unit-tested.
 */
export const createRandomTodo = async (
  state: Pick<State, "entities">,
  {
    nameGenerator,
    analytics,
  }: Pick<Services, "nameGenerator" | "analytics">,
): Promise<Pick<State, "entities">> => {
  const timing = await analytics.randomTodoRequested();
  const name = await nameGenerator.generateName();
  const next = appendTodo(state, { name });
  analytics.randomTodoAdded({ timing, name });
  return next;
};
