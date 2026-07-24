// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ConformanceCase } from "./conformance-case.js";

// Spec-owned `{ before, args, after }` cases for `State.toggleDisplayCompleted`
// (no args), shared with the ecs `toggleDisplayCompleted` transaction. Only the
// `displayCompleted` flag flips; the todos are untouched.
export const cases: readonly ConformanceCase<undefined>[] = [
  {
    name: "turns the completed view on",
    before: { todos: [], displayCompleted: false },
    args: undefined,
    after: { todos: [], displayCompleted: true },
  },
  {
    name: "turns the completed view off, leaving todos intact",
    before: { todos: [{ id: 1, name: "a", complete: true }], displayCompleted: true },
    args: undefined,
    after: { todos: [{ id: 1, name: "a", complete: true }], displayCompleted: false },
  },
];
