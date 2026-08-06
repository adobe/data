// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

export const toggleSpriteActive = <T extends Pick<State, "sprites">>(
  state: T,
  input: { readonly id: number },
): T => ({
  ...state,
  sprites: state.sprites.map((sprite) =>
    sprite.id === input.id ? { ...sprite, active: !sprite.active } : sprite,
  ),
});
