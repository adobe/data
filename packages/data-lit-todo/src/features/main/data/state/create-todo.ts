// © 2026 Adobe. MIT License. See /LICENSE for details.
import { AnalyticsService } from "../../services/analytics-service/analytics-service.js";
import type { Services } from "../../services/services.js";
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";
import { appendTodo } from "./append-todo.js";
import { Match } from "@adobe/data-testing";

// Reads the todos, writes the todos — a `{ todos }` patch — by delegating to the
// shared `appendTodo`; also logs `todoCreated`.
export const createTodo = (
  state: Pick<State, "todos">,
  {
    name,
    complete,
    analytics,
  }: {
    readonly name: string;
    readonly complete?: boolean;
  } & Pick<Services, "analytics">,
): Pick<State, "todos"> => {
  analytics.todoCreated({ name });
  return appendTodo(state, { name, complete });
};

// Spec-owned cases, shared with the ecs `createTodo` transaction. `before` is a
// delta over `State.create()` (no todos, completed hidden); `after` lists only
// what the transition writes — the todos (minted id left open as `Match.anyNumber`,
// the ecs assigns its own). `complete` defaults to false; it logs `todoCreated`.
export const cases: Conformance<typeof createTodo> = [
  {
    name: "appends the first todo to an empty list",
    before: {},
    args: { name: "a", analytics: AnalyticsService.createFake() },
    after: {
      todos: [{ id: Match.anyNumber, name: "a", complete: false }],
    },
    effects: { analytics: [["todoCreated", { name: "a" }]] },
  },
  {
    name: "appends a complete todo",
    before: { todos: [{ id: 1, name: "a", complete: false }] },
    args: {
      name: "b",
      complete: true,
      analytics: AnalyticsService.createFake(),
    },
    after: {
      todos: [
        { id: Match.anyNumber, name: "a", complete: false },
        { id: Match.anyNumber, name: "b", complete: true },
      ],
    },
    effects: { analytics: [["todoCreated", { name: "b" }]] },
  },
  {
    name: "appends onto a longer list",
    before: {
      todos: [
        { id: 1, name: "a", complete: false },
        { id: 2, name: "b", complete: true },
        { id: 3, name: "c", complete: false },
      ],
      displayCompleted: true,
    },
    args: { name: "d", analytics: AnalyticsService.createFake() },
    after: {
      todos: [
        { id: Match.anyNumber, name: "a", complete: false },
        { id: Match.anyNumber, name: "b", complete: true },
        { id: Match.anyNumber, name: "c", complete: false },
        { id: Match.anyNumber, name: "d", complete: false },
      ],
    },
    effects: { analytics: [["todoCreated", { name: "d" }]] },
  },
];
