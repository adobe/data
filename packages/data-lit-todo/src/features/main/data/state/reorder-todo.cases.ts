// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ConformanceCase } from "./conformance-case.js";

// Spec-owned `{ before, args, after }` cases for `State.reorderTodo`, shared with
// the ecs `dragTodo` transaction (behaviourally the same move — `dragTodo`'s
// final-drop `finalIndex` is `reorderTodo`'s `toIndex`). Every case keeps all
// todos incomplete with `displayCompleted` true, so the visible list `dragTodo`
// indexes into equals the full list `reorderTodo` indexes into. Todo ids run
// 1..N in display order for round-trip. The unknown-id no-op branch is exercised
// only by the pure transform test — `dragTodo` has no such guard.
type Args = { readonly id: number; readonly toIndex: number };

const three = [
  { id: 1, name: "a", complete: false },
  { id: 2, name: "b", complete: false },
  { id: 3, name: "c", complete: false },
];

export const cases: readonly ConformanceCase<Args>[] = [
  {
    name: "moves the first todo to the end",
    before: { todos: [...three], displayCompleted: true },
    args: { id: 1, toIndex: 2 },
    after: {
      todos: [
        { id: 2, name: "b", complete: false },
        { id: 3, name: "c", complete: false },
        { id: 1, name: "a", complete: false },
      ],
      displayCompleted: true,
    },
  },
  {
    name: "moves the last todo to the front",
    before: { todos: [...three], displayCompleted: true },
    args: { id: 3, toIndex: 0 },
    after: {
      todos: [
        { id: 3, name: "c", complete: false },
        { id: 1, name: "a", complete: false },
        { id: 2, name: "b", complete: false },
      ],
      displayCompleted: true,
    },
  },
  {
    name: "clamps an out-of-range index to the end",
    before: { todos: [...three], displayCompleted: true },
    args: { id: 1, toIndex: 99 },
    after: {
      todos: [
        { id: 2, name: "b", complete: false },
        { id: 3, name: "c", complete: false },
        { id: 1, name: "a", complete: false },
      ],
      displayCompleted: true,
    },
  },
  {
    name: "keeps the order when moving to the same index",
    before: { todos: [...three], displayCompleted: true },
    args: { id: 2, toIndex: 1 },
    after: { todos: [...three], displayCompleted: true },
  },
];
