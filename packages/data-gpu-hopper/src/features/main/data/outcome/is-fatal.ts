// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Outcome } from "./outcome.js";

// Which outcomes cost the frog a life. The step transform consumes this so it
// need not re-enumerate the fatal members.
export const isFatal: Record<Outcome, boolean> = {
  safe: false,
  ride: false,
  collide: true,
  drown: true,
  win: false,
};
