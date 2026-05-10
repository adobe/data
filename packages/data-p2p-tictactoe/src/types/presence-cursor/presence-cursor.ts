// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Cursor position as fractions [0–1] of board width/height —
 * resolution-independent. `null` means the player hasn't moved their
 * pointer over the board yet.
 */
export type PresenceCursor = { readonly x: number; readonly y: number } | null;
