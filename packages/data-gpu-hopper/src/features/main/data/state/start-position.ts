// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Frog } from "../frog/frog.js";

// Where the frog (re)spawns: centred on the bottom row.
export const startPosition = <T extends Pick<State, "width">>(state: T): Frog => ({
  x: Math.floor((state.width - 1) / 2),
  y: 0,
});
