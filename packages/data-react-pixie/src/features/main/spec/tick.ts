// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Sprite } from "../data/entities/sprite.js";
import type { State } from "./state.js";

// Advance one animation frame: every sprite rotates by `delta * 0.1` radians.
// `delta` is the frame time step, supplied by the caller (the render loop).
// Writes only `entities`.
export const tick = (
  state: Pick<State, "entities">,
  input: { readonly delta: number },
): Pick<State, "entities"> => ({
  entities: new Map(
    [...state.entities].map(([id, sprite]): [number, Sprite] => [
      id,
      { ...sprite, rotation: sprite.rotation + input.delta * 0.1 },
    ]),
  ),
});
