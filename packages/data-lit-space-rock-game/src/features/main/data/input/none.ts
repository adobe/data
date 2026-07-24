// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Input } from "./input.js";

// The idle input: no turn, no thrust, no fire. A neutral default for a tick
// with no player action.
export const none: Input = { turn: 0, thrust: false, fire: false };
