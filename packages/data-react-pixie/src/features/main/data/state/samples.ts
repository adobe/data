// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Match } from "@adobe/data-testing";
import type { Sprite } from "../sprite/sprite.js";
import type { State } from "./state.js";

// Representative full states for the projection round-trip (toState ∘ fromState ≡
// identity). Entity keys are `Match.ref` distinct labels: the ecs reassigns ids
// from its own id-space, so the round-trip leaves them open. Varied sprite
// collections + scene filters exercise the whole ecs↔State map.
export const samples: readonly State[] = [
  {
    filter: "sepia",
    entities: new Map<number, Sprite>([
      [
        Match.ref("a"),
        { position: [100, 100], rotation: 0, kind: "bunny", hovered: false, active: false },
      ],
      [
        Match.ref("b"),
        { position: [300, 200], rotation: 1, kind: "fox", hovered: true, active: false },
      ],
      [
        Match.ref("c"),
        { position: [150, 250], rotation: 0.5, kind: "bunny", hovered: false, active: true },
      ],
    ]),
  },
  {
    filter: "none",
    entities: new Map<number, Sprite>(),
  },
  {
    filter: "blur",
    entities: new Map<number, Sprite>([
      [
        Match.ref("a"),
        { position: [10, 10], rotation: 0, kind: "fox", hovered: false, active: false },
      ],
      [
        Match.ref("b"),
        { position: [20, 20], rotation: 0, kind: "fox", hovered: false, active: false },
      ],
    ]),
  },
];
