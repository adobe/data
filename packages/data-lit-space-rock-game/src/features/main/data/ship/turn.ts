// © 2026 Adobe. MIT License. See /LICENSE for details.
import { turnRate } from "./turn-rate.js";

// Rotate the ship over `dt`. `direction` is -1 (left), 0 (none), or +1 (right).
export const turn = (rotation: number, direction: number, dt: number): number =>
  rotation + turnRate * direction * dt;
