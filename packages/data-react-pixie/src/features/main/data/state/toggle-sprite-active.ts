// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// Flip the addressed sprite's `active` flag. Writes only `entities`.
export const toggleSpriteActive = (
  state: Pick<State, "entities">,
  input: { readonly id: number },
): Pick<State, "entities"> => {
  const sprite = state.entities.get(input.id);
  if (sprite === undefined) return { entities: state.entities };
  return {
    entities: new Map(state.entities).set(input.id, {
      ...sprite,
      active: !sprite.active,
    }),
  };
};
