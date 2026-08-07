// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec2 } from "@adobe/data/math";
import type { CoreDatabase } from "../../core-database/core-database.js";
import { setBounds } from "./set-bounds.js";
import { newGame } from "./new-game.js";

// createInitial ⇄ State.createInitial: seed the play-field `bounds` the reset
// reads, then start a fresh game. This single transaction realizes the
// `createInitial` transition end-to-end so conformance can pair it by name;
// `newGame`/`setBounds` remain the infra pieces the UI drives directly.
export const createInitial = (
  t: CoreDatabase.Store,
  { bounds }: { bounds: Vec2 },
): void => {
  setBounds(t, bounds);
  newGame(t);
};
