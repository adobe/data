// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec2, F32 } from "@adobe/data/math";
import type { SpriteKind } from "../sprite-kind/sprite-kind.js";

// One sprite entity value in the logical application State — plain readonly
// data with NO id. Identity lives in the `State.entities` map key, never in the
// value; the ECS materialises each sprite as an entity keyed by that id.
export type Sprite = {
  readonly position: Vec2;
  readonly rotation: F32;
  readonly kind: SpriteKind;
  readonly hovered: boolean;
  readonly active: boolean;
};
export * as Sprite from "./public.js";
