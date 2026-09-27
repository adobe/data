// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// Set the addressed sprite's `active` flag. Writes only `entities`.
export const setSpriteActive = (
  state: Pick<State, "entities">,
  input: { readonly id: number; readonly active: boolean },
): Pick<State, "entities"> => {
  const sprite = state.entities.get(input.id);
  if (sprite === undefined) return { entities: state.entities };
  return {
    entities: new Map(state.entities).set(input.id, {
      ...sprite,
      active: input.active,
    }),
  };
};
