// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Frog } from "../data/values/frog/frog.js";
import type { Direction } from "../data/values/direction/direction.js";
import { GameStatus } from "../data/values/game-status/game-status.js";
import type { State } from "./state.js";

// Hop the frog one cell in `direction` (see `Frog.hop`). A no-op unless the game is in
// play. Writes only `frog`.
export const hop = (
  state: Pick<State, "frog" | "boardWidth" | "boardHeight" | "status">,
  { direction }: { readonly direction: Direction },
): Pick<State, "frog"> =>
  GameStatus.isPlaying(state.status)
    ? { frog: Frog.hop(state.frog, direction, state.boardWidth, state.boardHeight) }
    : { frog: state.frog };
