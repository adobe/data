// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec2 } from "@adobe/data/math";
import type { SpriteKind } from "../sprite-kind/sprite-kind.js";
import type { State } from "./state.js";

const nextSpriteId = (state: Pick<State, "sprites">): number =>
  state.sprites.reduce((max, sprite) => Math.max(max, sprite.id), 0) + 1;

export const createSprite = <T extends Pick<State, "sprites">>(
  state: T,
  input: { readonly position: Vec2; readonly rotation?: number; readonly kind: SpriteKind },
): T => ({
  ...state,
  sprites: [
    ...state.sprites,
    {
      id: nextSpriteId(state),
      position: input.position,
      rotation: input.rotation ?? 0,
      kind: input.kind,
      hovered: false,
      active: false,
    },
  ],
});
