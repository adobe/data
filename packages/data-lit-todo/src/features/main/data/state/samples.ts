// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Match } from "@adobe/data-testing";
import type { State } from "./state.js";

// Representative full states for the projection round-trip (toState ∘ fromState ≡
// identity). Todo ids are authored as `anyNumber`: the ecs reassigns ids from its
// own id-space, so the round-trip leaves them open. Varied lists (mixed
// complete/incomplete, empty, duplicate names) exercise the whole ecs↔State map.
export const samples: readonly State[] = [
  {
    todos: [
      { id: Match.anyNumber, name: "buy milk", complete: false },
      { id: Match.anyNumber, name: "walk dog", complete: true },
      { id: Match.anyNumber, name: "write tests", complete: false },
    ],
    displayCompleted: true,
  },
  { todos: [], displayCompleted: false },
  {
    todos: [
      { id: Match.anyNumber, name: "task", complete: false },
      { id: Match.anyNumber, name: "task", complete: false },
      { id: Match.anyNumber, name: "task", complete: true },
    ],
    displayCompleted: false,
  },
];
