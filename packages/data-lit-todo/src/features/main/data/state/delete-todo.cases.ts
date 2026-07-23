// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ConformanceCase } from "./conformance-case.js";

// Spec-owned `{ before, args, after }` cases for `State.deleteTodo`, shared with
// the ecs `deleteTodo` transaction. The todo with the given id is removed;
// an unknown id is a no-op. Todo ids run 1..N in display order for round-trip.
type Args = { readonly id: number };

const three = [
  { id: 1, name: "a", complete: false },
  { id: 2, name: "b", complete: true },
  { id: 3, name: "c", complete: false },
];

export const cases: readonly ConformanceCase<Args>[] = [
  {
    name: "removes a middle todo",
    before: { todos: [...three], displayCompleted: false },
    args: { id: 2 },
    after: {
      todos: [
        { id: 1, name: "a", complete: false },
        { id: 3, name: "c", complete: false },
      ],
      displayCompleted: false,
    },
  },
  {
    name: "removes the first todo",
    before: { todos: [...three], displayCompleted: true },
    args: { id: 1 },
    after: {
      todos: [
        { id: 2, name: "b", complete: true },
        { id: 3, name: "c", complete: false },
      ],
      displayCompleted: true,
    },
  },
  {
    name: "is a no-op for an unknown id",
    before: { todos: [...three], displayCompleted: false },
    args: { id: 99 },
    after: { todos: [...three], displayCompleted: false },
  },
];
