// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Services } from "../../services/services.js";
import type { State } from "./state.js";

// Reads the entities, writes the entities — an `{ entities }` patch — dropping the
// addressed id; also logs `todoDeleted`. Surviving todos keep their `order` (the
// ecs `deleteTodo` does not renumber either).
export const deleteTodo = (
  state: Pick<State, "entities">,
  {
    id,
    analytics,
  }: { readonly id: number } & Pick<Services, "analytics">,
): Pick<State, "entities"> => {
  analytics.todoDeleted();
  const entities = new Map(state.entities);
  entities.delete(id);
  return { entities };
};
