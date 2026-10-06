// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Frog } from "../../data/values/frog/frog.js";
import type { Direction } from "../../data/values/direction/direction.js";
import { GameStatus } from "../../data/values/game-status/game-status.js";
import type { CoreDatabase } from "../core/core-database.js";

// Hop the frog one cell (see `Frog.hop`); a no-op unless the game is in play.
export const hop = (t: CoreDatabase.Store, { direction }: { readonly direction: Direction }) => {
  const { resources } = t;
  if (!GameStatus.isPlaying(resources.status)) return;
  resources.frog = Frog.hop(resources.frog, direction, resources.boardWidth, resources.boardHeight);
};
