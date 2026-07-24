// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Lane } from "../lane/lane.js";
import type { Hazard } from "../hazard/hazard.js";
import type { Frog } from "../frog/frog.js";
import type { GameStatus } from "../game-status/game-status.js";

// The whole game modelled as one immutable value — the specification the ECS
// implementation is verified against. `lanes` is the static board terrain;
// `hazards` and `frog` are the moving pieces.
export type State = {
  readonly width: number;
  readonly height: number;
  readonly lanes: readonly Lane[];
  readonly hazards: readonly Hazard[];
  readonly frog: Frog;
  readonly lives: number;
  readonly score: number;
  readonly status: GameStatus;
};
export * as State from "./public.js";
