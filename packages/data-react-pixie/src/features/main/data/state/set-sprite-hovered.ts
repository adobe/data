// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

export const setSpriteHovered = <T extends Pick<State, "sprites">>(
  state: T,
  input: { readonly id: number; readonly hovered: boolean },
): T => ({
  ...state,
  sprites: state.sprites.map((sprite) =>
    sprite.id === input.id ? { ...sprite, hovered: input.hovered } : sprite,
  ),
});
