// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Match } from "@adobe/data-testing";
import type { State } from "./state.js";

// Representative full states for the projection round-trip (toState ∘ fromState ≡
// identity). Sprite ids are authored as `anyNumber`: the ecs reassigns ids from
// its own id-space, so the round-trip leaves them open. Varied sprite collections
// + scene filters exercise the whole ecs↔State map.
export const samples: readonly State[] = [
  {
    sprites: [
      {
        id: Match.anyNumber,
        position: [100, 100],
        rotation: 0,
        kind: "bunny",
        hovered: false,
        active: false,
      },
      {
        id: Match.anyNumber,
        position: [300, 200],
        rotation: 1,
        kind: "fox",
        hovered: true,
        active: false,
      },
      {
        id: Match.anyNumber,
        position: [150, 250],
        rotation: 0.5,
        kind: "bunny",
        hovered: false,
        active: true,
      },
    ],
    filter: "sepia",
  },
  {
    sprites: [],
    filter: "none",
  },
  {
    sprites: [
      {
        id: Match.anyNumber,
        position: [10, 10],
        rotation: 0,
        kind: "fox",
        hovered: false,
        active: false,
      },
      {
        id: Match.anyNumber,
        position: [20, 20],
        rotation: 0,
        kind: "fox",
        hovered: false,
        active: false,
      },
    ],
    filter: "blur",
  },
];
