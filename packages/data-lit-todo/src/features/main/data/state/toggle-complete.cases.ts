// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ConformanceCase } from "./conformance-case.js";

// Spec-owned `{ before, args, after }` cases for `State.toggleComplete`, shared
// with the ecs `toggleComplete` transaction. Only the matching todo's `complete`
// flag flips; an unknown id is a no-op. Todo ids run 1..N in display order.
type Args = { readonly id: number };

export const cases: readonly ConformanceCase<Args>[] = [
  {
    name: "marks an incomplete todo complete",
    before: {
      todos: [
        { id: 1, name: "a", complete: false },
        { id: 2, name: "b", complete: false },
      ],
      displayCompleted: false,
    },
    args: { id: 1 },
    after: {
      todos: [
        { id: 1, name: "a", complete: true },
        { id: 2, name: "b", complete: false },
      ],
      displayCompleted: false,
    },
  },
  {
    name: "marks a complete todo incomplete",
    before: {
      todos: [
        { id: 1, name: "a", complete: true },
        { id: 2, name: "b", complete: false },
      ],
      displayCompleted: true,
    },
    args: { id: 1 },
    after: {
      todos: [
        { id: 1, name: "a", complete: false },
        { id: 2, name: "b", complete: false },
      ],
      displayCompleted: true,
    },
  },
  {
    name: "is a no-op for an unknown id",
    before: { todos: [{ id: 1, name: "a", complete: false }], displayCompleted: false },
    args: { id: 99 },
    after: { todos: [{ id: 1, name: "a", complete: false }], displayCompleted: false },
  },
];
