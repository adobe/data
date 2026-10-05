// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// Representative full states for the projection round-trip (toState ∘ fromState ≡
// identity). keys each id-less sprite with a plain spec-id (compared up to an id-bijection):
// the ecs reassigns ids from its own id-space, so the round-trip leaves them open.
// Varied sprite collections + scene filters exercise the whole ecs↔State map.
export const samples: readonly State[] = [
  {
    filter: "sepia",
    entities: new Map([
      [1, { position: [100, 100], rotation: 0, kind: "bunny", hovered: false, active: false }],
      [2, { position: [300, 200], rotation: 1, kind: "fox", hovered: true, active: false }],
      [3, { position: [150, 250], rotation: 0.5, kind: "bunny", hovered: false, active: true }],
    ]),
  },
  {
    filter: "none",
    entities: new Map(),
  },
  {
    filter: "blur",
    entities: new Map([
      [1, { position: [10, 10], rotation: 0, kind: "fox", hovered: false, active: false }],
      [2, { position: [20, 20], rotation: 0, kind: "fox", hovered: false, active: false }],
    ]),
  },
];
