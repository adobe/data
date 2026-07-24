// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ConformanceCase } from "./conformance-case.js";

// Spec-owned `{ before, args, after }` cases for `State.deleteAllTodos` (no
// args), shared with the ecs `deleteAllTodos` transaction. Every todo is
// removed; `displayCompleted` is left untouched.
export const cases: readonly ConformanceCase<undefined>[] = [
  {
    name: "empties a populated list, preserving displayCompleted",
    before: {
      todos: [
        { id: 1, name: "a", complete: false },
        { id: 2, name: "b", complete: true },
        { id: 3, name: "c", complete: false },
      ],
      displayCompleted: true,
    },
    args: undefined,
    after: { todos: [], displayCompleted: true },
  },
  {
    name: "is a no-op on an already empty list",
    before: { todos: [], displayCompleted: false },
    args: undefined,
    after: { todos: [], displayCompleted: false },
  },
];
