// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { deleteAllTodos } from "./delete-all-todos.js";

// Inert cases for `deleteAllTodos` (service-only args — no data `args`). Every todo
// is removed, `displayCompleted` is untouched, and `allTodosCleared` is logged.
export const cases: Conformance.SpecCases<State, typeof deleteAllTodos> = {
  cases: [
    {
      name: "empties a populated list, preserving displayCompleted",
      before: {
        entities: new Map([
          [1, { name: "a", complete: false, order: 0 }],
          [2, { name: "b", complete: true, order: 1 }],
          [3, { name: "c", complete: false, order: 2 }],
        ]),
        displayCompleted: true,
      },
      after: { entities: new Map() },
      effects: { analytics: [["allTodosCleared"]] },
    },
    {
      name: "is a no-op on an already empty list but still logs the clear",
      before: {},
      after: { entities: new Map() },
      effects: { analytics: [["allTodosCleared"]] },
    },
  ],
};
