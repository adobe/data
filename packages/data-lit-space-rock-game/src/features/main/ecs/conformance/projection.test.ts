// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Guards the projection itself. `fromState` and `toState` are the bridge every
// transaction / system conformance test trusts; a symmetric bug in the pair
// (e.g. both dropping the same field) would cancel out and mask a real ecs
// defect. This identity test — `toState(fromState(s)) ≡ s` over representative
// states — proves the projection round-trips faithfully on its own.
import { describe, it } from "vitest";
import type { State } from "../../data/state/state.js";
import { expectStateMatches } from "../../data/state/expect-state-matches.js";
import { createStore } from "./create-store.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

const states: readonly { readonly name: string; readonly state: State }[] = [
  {
    name: "a full game: ship + bullets + asteroids of every size, non-zero counters",
    state: {
      bounds: [800, 600],
      ship: { position: [400, 300], velocity: [12, -7], rotation: 1.25 },
      bullets: [
        { position: [100, 100], velocity: [400, 0], age: 0.1 },
        { position: [220, 340], velocity: [-100, 200], age: 0.9 },
      ],
      asteroids: [
        { position: [50, 60], velocity: [10, 20], size: "large" },
        { position: [700, 80], velocity: [-30, 5], size: "medium" },
        { position: [640, 540], velocity: [0, -15], size: "small" },
      ],
      score: 240,
      lives: 2,
      wave: 5,
    },
  },
  {
    name: "no bullets and no asteroids (just the ship)",
    state: {
      bounds: [320, 240],
      ship: { position: [160, 120], velocity: [0, 0], rotation: -Math.PI / 2 },
      bullets: [],
      asteroids: [],
      score: 0,
      lives: 3,
      wave: 0,
    },
  },
  {
    name: "many same-size asteroids at the same point (multiset round-trip)",
    state: {
      bounds: [500, 500],
      ship: { position: [250, 250], velocity: [0, 0], rotation: 0 },
      bullets: [],
      asteroids: [
        { position: [250, 250], velocity: [0, 0], size: "medium" },
        { position: [250, 250], velocity: [0, 0], size: "medium" },
        { position: [250, 250], velocity: [0, 0], size: "medium" },
      ],
      score: 90,
      lives: 1,
      wave: 3,
    },
  },
];

describe("ecs/conformance projection round-trips (toState ∘ fromState ≡ identity)", () => {
  for (const { name, state } of states) {
    it(name, () => {
      const store = createStore();
      fromState(store, state);
      expectStateMatches(toState(store), state);
    });
  }
});
