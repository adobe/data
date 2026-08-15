// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Match } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { Todo } from "../todo/todo.js";

// Representative full states for the projection round-trip (toState ∘ fromState ≡
// identity). Entity keys are authored as `Match.ref` with distinct labels: the ecs
// reassigns ids from its own id-space, so the round-trip leaves the keys open while
// the id-less values compare by content. Varied lists (mixed complete/incomplete,
// empty, duplicate names) exercise the whole ecs↔State map.
export const samples: readonly State[] = [
  {
    entities: new Map([
      [Match.ref("a"), { name: "buy milk", complete: false, order: 0 }],
      [Match.ref("b"), { name: "walk dog", complete: true, order: 1 }],
      [Match.ref("c"), { name: "write tests", complete: false, order: 2 }],
    ]),
    displayCompleted: true,
  },
  { entities: new Map<number, Todo>(), displayCompleted: false },
  {
    entities: new Map([
      [Match.ref("a"), { name: "task", complete: false, order: 0 }],
      [Match.ref("b"), { name: "task", complete: false, order: 1 }],
      [Match.ref("c"), { name: "task", complete: true, order: 2 }],
    ]),
    displayCompleted: false,
  },
];
