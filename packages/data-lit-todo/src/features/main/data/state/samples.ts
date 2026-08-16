// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Match } from "@adobe/data-testing";
import type { State } from "./state.js";

// Representative full states for the projection round-trip (toState ∘ fromState ≡
// identity). `Match.refMap` keys each id-less value with a distinct open matcher:
// the ecs reassigns ids from its own id-space, so the round-trip leaves the keys
// open while the values compare by content. Varied lists (mixed complete/incomplete,
// empty, duplicate names) exercise the whole ecs↔State map.
export const samples: readonly State[] = [
  {
    entities: Match.refMap([
      { name: "buy milk", complete: false, order: 0 },
      { name: "walk dog", complete: true, order: 1 },
      { name: "write tests", complete: false, order: 2 },
    ]),
    displayCompleted: true,
  },
  { entities: Match.refMap([]), displayCompleted: false },
  {
    entities: Match.refMap([
      { name: "task", complete: false, order: 0 },
      { name: "task", complete: false, order: 1 },
      { name: "task", complete: true, order: 2 },
    ]),
    displayCompleted: false,
  },
];
