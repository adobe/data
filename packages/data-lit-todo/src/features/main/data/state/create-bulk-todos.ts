// © 2026 Adobe. MIT License. See /LICENSE for details.
import { AnalyticsService } from "../../services/analytics-service/analytics-service.js";
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";
import { appendTodo } from "./append-todo.js";
import { Match } from "@adobe/data/testing";
/** Adds numbered placeholder todos for demos and performance testing. */
export const createBulkTodos = <T extends Pick<State, "todos">>(
  state: T,
  {
    count,
    analytics,
  }: { readonly count: number; readonly analytics: AnalyticsService },
): T => {
  analytics.bulkTodosCreated({ count });
  const total = Math.max(0, Math.floor(count));
  let next = state;
  for (let index = 0; index < total; index++) {
    next = appendTodo(next, { name: `Todo ${state.todos.length + index}` });
  }
  return next;
};

// Spec-owned cases, shared with the ecs `createBulkTodos` transaction. `count`
// (floored, clamped at 0) numbered todos are appended; the transition logs
// `bulkTodosCreated` with the raw count (as the action does), even on a no-op.
// Minted ids are left open (`Match.anyNumber`) — the ecs assigns its own.
export const cases: Conformance<typeof createBulkTodos> = [
  {
    name: "appends count numbered todos to an empty list",
    before: { todos: [], displayCompleted: false },
    args: { count: 3, analytics: AnalyticsService.createFake() },
    after: {
      todos: [
        { id: Match.anyNumber, name: "Todo 0", complete: false },
        { id: Match.anyNumber, name: "Todo 1", complete: false },
        { id: Match.anyNumber, name: "Todo 2", complete: false },
      ],
      displayCompleted: false,
    },
    effects: { analytics: [["bulkTodosCreated", { count: 3 }]] },
  },
  {
    name: "continues names after existing todos",
    before: {
      todos: [{ id: 1, name: "a", complete: false }],
      displayCompleted: false,
    },
    args: { count: 2, analytics: AnalyticsService.createFake() },
    after: {
      todos: [
        { id: Match.anyNumber, name: "a", complete: false },
        { id: Match.anyNumber, name: "Todo 1", complete: false },
        { id: Match.anyNumber, name: "Todo 2", complete: false },
      ],
      displayCompleted: false,
    },
    effects: { analytics: [["bulkTodosCreated", { count: 2 }]] },
  },
  {
    name: "floors a fractional count",
    before: { todos: [], displayCompleted: false },
    args: { count: 2.9, analytics: AnalyticsService.createFake() },
    after: {
      todos: [
        { id: Match.anyNumber, name: "Todo 0", complete: false },
        { id: Match.anyNumber, name: "Todo 1", complete: false },
      ],
      displayCompleted: false,
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
      displayCompleted: true,
    },
    effects: { analytics: [["bulkTodosCreated", { count: 0 }]] },
  },
];
