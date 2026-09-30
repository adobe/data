// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Services } from "../services/services.js";
import type { State } from "./state.js";
import { appendTodo } from "./append-todo.js";

// Reads the entities, writes the entities — an `{ entities }` patch — by
// delegating to the shared `appendTodo`; also logs `todoCreated`.
export const createTodo = (
  state: Pick<State, "entities">,
  {
    name,
    complete,
    analytics,
  }: {
    readonly name: string;
    readonly complete?: boolean;
  } & Pick<Services, "analytics">,
): Pick<State, "entities"> => {
  analytics.todoCreated({ name });
  return appendTodo(state, { name, complete });
};
