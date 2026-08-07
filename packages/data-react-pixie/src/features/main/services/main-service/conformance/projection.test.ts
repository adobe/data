// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Guards the projection itself. `fromState` and `toState` are the bridge every
// transaction/action conformance test trusts; a symmetric bug in the pair (e.g.
// both dropping the same field) would cancel out and mask a real ecs defect. This
// identity test — `toState(fromState(s)) ≡ s` over representative states — proves
// the projection round-trips faithfully on its own.
import { describe, it } from "vitest";
import { Match } from "@adobe/data/testing";
import type { State } from "../../../data/state/state.js";
import { createStore } from "./create-store.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

const states: readonly { readonly name: string; readonly state: State }[] = [
  {
    name: "a mix of sprites with a scene filter",
    state: {
      sprites: [
        {
          id: 1,
          position: [100, 100],
          rotation: 0,
          kind: "bunny",
          hovered: false,
          active: false,
        },
        {
          id: 2,
          position: [300, 200],
          rotation: 1,
          kind: "fox",
          hovered: true,
          active: false,
        },
        {
          id: 3,
          position: [150, 250],
          rotation: 0.5,
          kind: "bunny",
          hovered: false,
          active: true,
        },
      ],
      filter: "sepia",
    },
  },
  {
    name: "an empty scene with no filter",
    state: { sprites: [], filter: "none" },
  },
  {
    name: "sprites sharing a kind, blur filter",
    state: {
      sprites: [
        {
          id: 1,
          position: [10, 10],
          rotation: 0,
          kind: "fox",
          hovered: false,
          active: false,
        },
        {
          id: 2,
          position: [20, 20],
          rotation: 0,
          kind: "fox",
          hovered: false,
          active: false,
        },
      ],
      filter: "blur",
    },
  },
];

describe("ecs/conformance projection round-trips (toState ∘ fromState ≡ identity)", () => {
  for (const { name, state } of states) {
    it(name, () => {
      const store = createStore();
      fromState(store, state);
      // The ecs reassigns ids from its own id-space, so compare against the same
      // state with ids left open.
      Match.assert(toState(store), {
        ...state,
        sprites: state.sprites.map((sprite) => ({
          ...sprite,
          id: Match.anyNumber,
        })),
      });
    });
  }
});
