// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec2 } from "@adobe/data/math";
import type { PlayerMark } from "data-lit-tictactoe";

/**
 * Each connected peer's cursor position in normalised `[0..1, 0..1]`
 * coordinates relative to the overlay element, keyed by `PlayerMark`. Entries
 * appear when a peer first reports a position and may be absent for peers that
 * have never moved their cursor.
 */
export const cursors = { default: {} as Partial<Record<PlayerMark, Vec2>> };
