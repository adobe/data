// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import { Lives } from "../data/values/lives/lives.js";

// A system's game-over guard, as in every ECS system: while the game is on, `play`;
// once it is over, hand back the state read, so the system writes nothing new.
export const whilePlaying = <S extends Pick<State, "lives">, R>(state: S, play: (state: S) => R): S | R =>
  Lives.isGameOver(state.lives) ? state : play(state);
