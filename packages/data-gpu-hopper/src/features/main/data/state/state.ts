// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Lane } from "../lane/lane.js";
import type { Hazard } from "../hazard/hazard.js";
import type { Frog } from "../frog/frog.js";
import type { GameStatus } from "../game-status/game-status.js";

// The whole game modelled as one immutable value — the specification the ECS
// implementation is verified against. `width`/`height`/`frog`/`lives`/`score`/
// `status` are singletons (ECS resources / the single frog entity); `lanes` is the
// fixed board terrain (an ECS resource, not per-entity). `entities` is the one
// identity-keyed map of the game's per-entity ECS entities — the moving hazards —
// keyed by a plain numeric id, the value id-less.
export type State = {
  readonly width: number;
  readonly height: number;
  readonly lanes: readonly Lane[];
  readonly entities: ReadonlyMap<number, Hazard>;
  readonly frog: Frog;
  readonly lives: number;
  readonly score: number;
  readonly status: GameStatus;
};
export * as State from "./public.js";
