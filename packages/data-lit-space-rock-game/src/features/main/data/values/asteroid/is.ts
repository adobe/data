// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Asteroid } from "./asteroid.js";
import { Size } from "../size/size.js";

// Structural guard, re-exported so it reads as `Asteroid.is`. Within
// `State.entities` a value is a `Bullet | Asteroid`; an asteroid is the one that
// carries a `size` tier — the bullet carries `age` instead — so `size` is the
// distinguishing member. Every entity value also carries `position` + `velocity`.
export const is = (v: unknown): v is Asteroid =>
  typeof v === "object" &&
  v !== null &&
  "position" in v &&
  "velocity" in v &&
  "size" in v &&
  Size.is(v.size);
