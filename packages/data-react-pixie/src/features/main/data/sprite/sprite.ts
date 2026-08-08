// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec2, F32 } from "@adobe/data/math";
import type { SpriteKind } from "../sprite-kind/sprite-kind.js";

// One sprite entity in the logical application State. `id` is the sprite's
// domain identity; the ECS materialises each sprite as an entity whose id is
// drawn from its own id-space (conformance compares ignoring ids).
export type Sprite = {
  readonly id: number;
  readonly position: Vec2;
  readonly rotation: F32;
  readonly kind: SpriteKind;
  readonly hovered: boolean;
  readonly active: boolean;
};
export * as Sprite from "./public.js";
