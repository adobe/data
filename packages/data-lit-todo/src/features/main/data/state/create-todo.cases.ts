// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ConformanceCase } from "./conformance-case.js";

// Spec-owned `{ before, args, after }` cases for `State.createTodo`, shared with
// the ecs `createTodo` transaction. A todo is appended with the next id
// (max existing id + 1) and `complete` defaulting to false. Todo ids run 1..N in
// display order so the ecs projection (which assigns entity ids in that order)
// round-trips — see `ecs/conformance/from-state.ts`.
type Args = { readonly name: string; readonly complete?: boolean };

export const cases: readonly ConformanceCase<Args>[] = [
  {
    name: "appends the first todo (id 1) to an empty list",
    before: { todos: [], displayCompleted: false },
    args: { name: "a" },
    after: { todos: [{ id: 1, name: "a", complete: false }], displayCompleted: false },
  },
  {
    name: "appends a complete todo with the next id",
    before: { todos: [{ id: 1, name: "a", complete: false }], displayCompleted: false },
    args: { name: "b", complete: true },
    after: {
      todos: [
        { id: 1, name: "a", complete: false },
        { id: 2, name: "b", complete: true },
      ],
      displayCompleted: false,
    },
  },
  {
    name: "takes the next id as max + 1 over a longer list",
    before: {
      todos: [
        { id: 1, name: "a", complete: false },
        { id: 2, name: "b", complete: true },
        { id: 3, name: "c", complete: false },
      ],
      displayCompleted: true,
    },
    args: { name: "d" },
    after: {
      todos: [
        { id: 1, name: "a", complete: false },
        { id: 2, name: "b", complete: true },
        { id: 3, name: "c", complete: false },
        { id: 4, name: "d", complete: false },
      ],
      displayCompleted: true,
    },
  },
];
