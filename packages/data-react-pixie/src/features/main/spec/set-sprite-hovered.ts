// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// Set the addressed sprite's `hovered` flag. Writes only `entities`.
export const setSpriteHovered = (
  state: Pick<State, "entities">,
  input: { readonly id: number; readonly hovered: boolean },
): Pick<State, "entities"> => {
  const sprite = state.entities.get(input.id);
  if (sprite === undefined) return { entities: state.entities };
  return {
    entities: new Map(state.entities).set(input.id, {
      ...sprite,
      hovered: input.hovered,
    }),
  };
};
