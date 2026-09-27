// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Services } from "../../services/services.js";
import type { State } from "./state.js";

// Reads the entities, writes the entities — an `{ entities }` patch — flipping the
// addressed todo's `complete`; also logs `todoToggled`.
export const toggleComplete = (
  state: Pick<State, "entities">,
  {
    id,
    analytics,
  }: { readonly id: number } & Pick<Services, "analytics">,
): Pick<State, "entities"> => {
  analytics.todoToggled();
  const target = state.entities.get(id);
  if (target === undefined) return { entities: state.entities };
  return {
    entities: new Map(state.entities).set(id, {
      ...target,
      complete: !target.complete,
    }),
  };
};
