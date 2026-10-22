// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Assert } from "@adobe/data/types";
import type { Conformance } from "@adobe/data-testing";
import type { Lane } from "../data/values/lane/lane.js";
import type { Frog } from "../data/values/frog/frog.js";
import type { GameStatus } from "../data/values/game-status/game-status.js";
import type { Hazard } from "../data/entities/hazard.js";
import type { components } from "../data/components/index.js";
import type { resources } from "../data/resources/index.js";

// The whole game as one immutable value: the specification the ECS implementation is
// verified against. Every field but `entities` is a singleton (a resource);
// `entities` holds the moving hazards keyed by a plain numeric id, the values id-less.
export type State = {
  readonly boardWidth: number;
  readonly boardHeight: number;
  readonly lanes: readonly Lane[];
  readonly entities: ReadonlyMap<number, Hazard>;
  readonly frog: Frog;
  readonly lives: number;
  readonly score: number;
  readonly status: GameStatus;
};

// Singleton keys name resources; entity value keys name components.
type _Pin = Assert<Conformance.StateMatches<State, typeof resources, typeof components>>;

export * as State from "./public.js";
