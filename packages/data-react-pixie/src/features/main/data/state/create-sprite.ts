// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec2 } from "@adobe/data/math";
import type { SpriteKind } from "../sprite-kind/sprite-kind.js";
import type { State } from "./state.js";

// Append a sprite to the scene. The spec mints the id (the map key); the value
// carries none. Returns only the field it writes (`entities`).
export const createSprite = (
  state: Pick<State, "entities">,
  input: {
    readonly position: Vec2;
    readonly rotation?: number;
    readonly kind: SpriteKind;
  },
): Pick<State, "entities"> => {
  const id = Math.max(0, ...state.entities.keys()) + 1;
  return {
    entities: new Map(state.entities).set(id, {
      position: input.position,
      rotation: input.rotation ?? 0,
      kind: input.kind,
      hovered: false,
      active: false,
    }),
  };
};
