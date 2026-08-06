// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec2 } from "@adobe/data/math";
import type { SpriteKind } from "../../../../data/sprite-kind/sprite-kind.js";
import type { CoreDatabase } from "../../core-database/core-database.js";

export const createSprite = (
  t: CoreDatabase.Store,
  input: { readonly position: Vec2; readonly rotation?: number; readonly kind: SpriteKind },
) =>
  t.archetypes.Sprite.insert({
    position: input.position,
    rotation: input.rotation ?? 0,
    kind: input.kind,
    hovered: false,
    active: false,
  });
