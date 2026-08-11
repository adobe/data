// © 2026 Adobe. MIT License. See /LICENSE for details.
import { AnalyticsService } from "../../services/analytics-service/analytics-service.js";
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";
import { appendTodo } from "./append-todo.js";
import { Match } from "@adobe/data-testing";
/** Adds numbered placeholder todos for demos and performance testing. Reads and
 * writes the todos — a `{ todos }` patch. */
export const createBulkTodos = (
  state: Pick<State, "todos">,
  {
    count,
    analytics,
  }: { readonly count: number; readonly analytics: AnalyticsService },
): Pick<State, "todos"> => {
  analytics.bulkTodosCreated({ count });
  const total = Math.max(0, Math.floor(count));
  let next: Pick<State, "todos"> = state;
  for (let index = 0; index < total; index++) {
    next = appendTodo(next, { name: `Todo ${state.todos.length + index}` });
  }
  return next;
};

// Spec-owned cases, shared with the ecs `createBulkTodos` transaction. `before`
// is a delta over `State.create()`; `after` lists only the written todos.
// `count` (floored, clamped at 0) numbered todos are appended; the transition
// logs `bulkTodosCreated` with the raw count (as the action does), even on a
// no-op. Minted ids are left open (`Match.anyNumber`) — the ecs assigns its own.
export const cases: Conformance<typeof createBulkTodos> = [
  {
    name: "appends count numbered todos to an empty list",
    before: {},
    args: { count: 3, analytics: AnalyticsService.createFake() },
    after: {
      todos: [
        { id: Match.anyNumber, name: "Todo 0", complete: false },
        { id: Match.anyNumber, name: "Todo 1", complete: false },
        { id: Match.anyNumber, name: "Todo 2", complete: false },
      ],
    },
    effects: { analytics: [["bulkTodosCreated", { count: 3 }]] },
  },
  {
    name: "continues names after existing todos",
    before: { todos: [{ id: 1, name: "a", complete: false }] },
    args: { count: 2, analytics: AnalyticsService.createFake() },
    after: {
      todos: [
        { id: Match.anyNumber, name: "a", complete: false },
        { id: Match.anyNumber, name: "Todo 1", complete: false },
        { id: Match.anyNumber, name: "Todo 2", complete: false },
      ],
    },
    effects: { analytics: [["bulkTodosCreated", { count: 2 }]] },
  },
  {
    name: "floors a fractional count",
    before: {},
    args: { count: 2.9, analytics: AnalyticsService.createFake() },
    after: {
      todos: [
        { id: Match.anyNumber, name: "Todo 0", complete: false },
        { id: Match.anyNumber, name: "Todo 1", complete: false },
      ],
    },
    effects: { analytics: [["bulkTodosCreated", { count: 2.9 }]] },
  },
  {
    name: "is a no-op for count 0 but still logs the request",
    before: {
      todos: [{ id: 1, name: "a", complete: false }],
      displayCompleted: true,
    },
    args: { count: 0, analytics: AnalyticsService.createFake() },
    after: {
      todos: [{ id: Match.anyNumber, name: "a", complete: false }],
    },
    effects: { analytics: [["bulkTodosCreated", { count: 0 }]] },
  },
];
