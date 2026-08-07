// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import { entity, type Conformance } from "./conformance-case.js";
import { Match } from "@adobe/data/testing";
/**
 * Moves the todo with the given id to `toIndex` within the list, preserving the
 * relative order of every other todo. Out-of-range indices are clamped and an
 * unknown id is a no-op. A pure reorder — no side effects.
 */
export const reorderTodo = <T extends Pick<State, "todos">>(
  state: T,
  input: { readonly id: number; readonly toIndex: number },
): T => {
  const fromIndex = state.todos.findIndex((todo) => todo.id === input.id);
  if (fromIndex === -1) return state;

  const moved = state.todos[fromIndex];
  const without = state.todos.filter((todo) => todo.id !== input.id);
  const toIndex = Math.max(0, Math.min(input.toIndex, without.length));

  return {
    ...state,
    todos: [...without.slice(0, toIndex), moved, ...without.slice(toIndex)],
  };
};

const three = [
  { id: 1, name: "a", complete: false },
  { id: 2, name: "b", complete: false },
  { id: 3, name: "c", complete: false },
];

// Spec-owned cases, shared with the ecs `dragTodo` transaction (its final drop is
// the same move — `finalIndex` is `toIndex`). Every case keeps all todos
// incomplete with `displayCompleted` true, so the visible list `dragTodo` indexes
// equals the full list. `before` ids address the move; `after` ids are open
// (`Match.anyNumber`) but their *order* is verified. The unknown-id no-op is exercised
// only by the pure transform — `dragTodo` has no such guard.
export const cases: Conformance<typeof reorderTodo> = [
  {
    name: "moves the first todo to the end",
    before: { todos: [...three], displayCompleted: true },
    args: { id: entity(1), toIndex: 2 },
    after: {
      todos: [
        { id: Match.anyNumber, name: "b", complete: false },
        { id: Match.anyNumber, name: "c", complete: false },
        { id: Match.anyNumber, name: "a", complete: false },
      ],
      displayCompleted: true,
    },
  },
  {
    name: "moves the last todo to the front",
    before: { todos: [...three], displayCompleted: true },
    args: { id: entity(3), toIndex: 0 },
    after: {
      todos: [
        { id: Match.anyNumber, name: "c", complete: false },
        { id: Match.anyNumber, name: "a", complete: false },
        { id: Match.anyNumber, name: "b", complete: false },
      ],
      displayCompleted: true,
    },
  },
  {
    name: "clamps an out-of-range index to the end",
    before: { todos: [...three], displayCompleted: true },
    args: { id: entity(1), toIndex: 99 },
    after: {
      todos: [
        { id: Match.anyNumber, name: "b", complete: false },
        { id: Match.anyNumber, name: "c", complete: false },
        { id: Match.anyNumber, name: "a", complete: false },
      ],
      displayCompleted: true,
    },
  },
  {
    name: "keeps the order when moving to the same index",
    before: { todos: [...three], displayCompleted: true },
    args: { id: entity(2), toIndex: 1 },
    after: {
      todos: [
        { id: Match.anyNumber, name: "a", complete: false },
        { id: Match.anyNumber, name: "b", complete: false },
        { id: Match.anyNumber, name: "c", complete: false },
      ],
      displayCompleted: true,
    },
  },
];
