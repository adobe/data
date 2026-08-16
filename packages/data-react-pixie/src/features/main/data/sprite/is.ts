// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Sprite } from "./sprite.js";

// A structural type guard, re-exported so it reads as `Sprite.is`. A value is a
// Sprite when it carries the sprite component shape (a superset match, mirroring
// the ECS archetype query).
export const is = (v: unknown): v is Sprite =>
  typeof v === "object" &&
  v !== null &&
  "position" in v &&
  Array.isArray((v as Sprite).position) &&
  (v as Sprite).position.length === 2 &&
  "rotation" in v &&
  typeof (v as Sprite).rotation === "number" &&
  "kind" in v &&
  typeof (v as Sprite).kind === "string" &&
  "hovered" in v &&
  typeof (v as Sprite).hovered === "boolean" &&
  "active" in v &&
  typeof (v as Sprite).active === "boolean";
