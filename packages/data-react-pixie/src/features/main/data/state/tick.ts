// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// Advance one animation frame: every sprite rotates by `delta * 0.1` radians.
// `delta` is the frame time step, supplied by the caller (the render loop).
export const tick = <T extends Pick<State, "sprites">>(
  state: T,
  input: { readonly delta: number },
): T => ({
  ...state,
  sprites: state.sprites.map((sprite) => ({
    ...sprite,
    rotation: sprite.rotation + input.delta * 0.1,
  })),
});
