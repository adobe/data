// © 2026 Adobe. MIT License. See /LICENSE for details.
import { GameStatus } from "../data/values/game-status/game-status.js";
import type { GameStatus as GameStatusType } from "../data/values/game-status/game-status.js";

// A system's game-over guard: `run()` while the game is in play, else `held` (the
// system's writes left as they are).
export const whilePlaying = <W>(status: GameStatusType, held: W, run: () => W): W =>
  GameStatus.isPlaying(status) ? run() : held;
