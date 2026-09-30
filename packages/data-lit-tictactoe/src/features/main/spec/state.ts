// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Assert } from "@adobe/data/types";
import type { Conformance } from "@adobe/data-testing";
import type { PlacedMark } from "../data/entities/placed-mark.js";
import type { PlayerMark } from "../data/values/player-mark/player-mark.js";
import type { Score } from "../data/values/score/score.js";
import type { components } from "../data/components/index.js";
import type { resources } from "../data/resources/index.js";

// The game state as one immutable object — the specification the ECS implementation
// is verified against. `marks` holds every placed mark keyed by a numeric id (identity
// is the key); the rest are singletons.
export type State = {
  readonly marks: ReadonlyMap<number, PlacedMark>;
  readonly firstPlayer: PlayerMark;
  readonly xWins: Score;
  readonly oWins: Score;
  readonly draws: Score;
};

// Singleton keys name resources; entity value keys name components.
type _Pin = Assert<Conformance.StateMatches<State, typeof resources, typeof components>>;

export * as State from "./public.js";
