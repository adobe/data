// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ConformanceCase } from "./conformance-case.js";

// Spec-owned `{ before, args, after }` cases for `State.createBulkTodos`, shared
// with the ecs `createBulkTodos` transaction. `count` (floored, clamped at 0)
// numbered placeholder todos are appended: name `Todo ${length + index}`, id
// continuing max + 1. Todo ids run 1..N in display order for round-trip.
type Args = { readonly count: number };

export const cases: readonly ConformanceCase<Args>[] = [
  {
    name: "appends count numbered todos to an empty list",
    before: { todos: [], displayCompleted: false },
    args: { count: 3 },
    after: {
      todos: [
        { id: 1, name: "Todo 0", complete: false },
        { id: 2, name: "Todo 1", complete: false },
        { id: 3, name: "Todo 2", complete: false },
      ],
      displayCompleted: false,
    },
  },
  {
    name: "continues names and ids after existing todos",
    before: { todos: [{ id: 1, name: "a", complete: false }], displayCompleted: false },
    args: { count: 2 },
    after: {
      todos: [
        { id: 1, name: "a", complete: false },
        { id: 2, name: "Todo 1", complete: false },
        { id: 3, name: "Todo 2", complete: false },
      ],
      displayCompleted: false,
    },
  },
  {
    name: "floors a fractional count",
    before: { todos: [], displayCompleted: false },
    args: { count: 2.9 },
    after: {
      todos: [
        { id: 1, name: "Todo 0", complete: false },
        { id: 2, name: "Todo 1", complete: false },
      ],
      displayCompleted: false,
    },
  },
  {
    name: "is a no-op for count 0",
    before: { todos: [{ id: 1, name: "a", complete: false }], displayCompleted: true },
    args: { count: 0 },
    after: { todos: [{ id: 1, name: "a", complete: false }], displayCompleted: true },
  },
];
