// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// Representative full states for the projection round-trip (toState ∘ fromState ≡
// identity). keys each id-less value with a plain spec-id (compared up to an id-bijection):
// the ecs reassigns ids from its own id-space, so the round-trip leaves the keys
// open while the values compare by content. Varied lists (mixed complete/incomplete,
// empty, duplicate names) exercise the whole ecs↔State map.
export const samples: readonly State[] = [
  {
    entities: new Map([
      [1, { name: "buy milk", complete: false, order: 0 }],
      [2, { name: "walk dog", complete: true, order: 1 }],
      [3, { name: "write tests", complete: false, order: 2 }],
    ]),
    displayCompleted: true,
  },
  { entities: new Map(), displayCompleted: false },
  {
    entities: new Map([
      [1, { name: "task", complete: false, order: 0 }],
      [2, { name: "task", complete: false, order: 1 }],
      [3, { name: "task", complete: true, order: 2 }],
    ]),
    displayCompleted: false,
  },
];
