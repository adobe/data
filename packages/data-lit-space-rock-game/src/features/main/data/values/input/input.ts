// © 2026 Adobe. MIT License. See /LICENSE for details.

// The player's intent for one tick: which way to turn (-1 left, 0 none, +1 right),
// whether the thruster is on, and whether the trigger is pulled.
export type Input = {
  readonly turn: number;
  readonly thrust: boolean;
  readonly fire: boolean;
};
export * as Input from "./public.js";
