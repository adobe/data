// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

export const setSpriteActive = <T extends Pick<State, "sprites">>(
  state: T,
  input: { readonly id: number; readonly active: boolean },
): T => ({
  ...state,
  sprites: state.sprites.map((sprite) =>
    sprite.id === input.id ? { ...sprite, active: input.active } : sprite,
  ),
});
