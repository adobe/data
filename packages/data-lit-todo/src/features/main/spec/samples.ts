// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "@adobe/data/ecs";
import type { State } from "./state.js";

// Representative full states for the projection round-trip (toState ∘ fromState ≡
// identity). Each id-less value is keyed by a plain spec-id (compared up to an
// id-bijection): the ecs reassigns ids from its own id-space, so the round-trip
// leaves the keys open while the values compare by content. The first sample also
// has a **reference** — `selectedTodo` points at todo `2` — so the round-trip
// exercises reference bijection: `fromState` resolves the spec-id to the entity it
// mints, `toState` reads that back, and the two line up under the bijection. Varied
// lists (mixed complete/incomplete, empty, duplicate names) exercise the rest.
export const samples: readonly State[] = [
  {
    entities: new Map([
      [1, { name: "buy milk", complete: false, order: 0 }],
      [2, { name: "walk dog", complete: true, order: 1 }],
      [3, { name: "write tests", complete: false, order: 2 }],
    ]),
    displayCompleted: true,
    selectedTodo: 2,
  },
  { entities: new Map(), displayCompleted: false, selectedTodo: Entity.none },
  {
    entities: new Map([
      [1, { name: "task", complete: false, order: 0 }],
      [2, { name: "task", complete: false, order: 1 }],
      [3, { name: "task", complete: true, order: 2 }],
    ]),
    displayCompleted: false,
    selectedTodo: Entity.none,
  },
];
