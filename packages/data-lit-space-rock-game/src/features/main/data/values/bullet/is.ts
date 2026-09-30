// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Bullet } from "./bullet.js";

// Structural guard, re-exported so it reads as `Bullet.is`. Within `State.entities`
// a value is a `Bullet | Asteroid`; a bullet is the one that carries an `age`
// (a number) — the asteroid carries `size` instead — so `age` is the
// distinguishing member. Every entity value also carries `position` + `velocity`.
export const is = (v: unknown): v is Bullet =>
  typeof v === "object" &&
  v !== null &&
  "position" in v &&
  "velocity" in v &&
  "age" in v &&
  typeof v.age === "number";
