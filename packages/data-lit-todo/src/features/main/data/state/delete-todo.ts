// © 2026 Adobe. MIT License. See /LICENSE for details.
import { AnalyticsService } from "../../services/analytics-service/analytics-service.js";
import type { State } from "./state.js";
import { entity, type Conformance } from "./conformance-case.js";
import { Match } from "@adobe/data/testing";

// Reads the todos, writes the todos — a `{ todos }` patch — dropping the
// addressed id; also logs `todoDeleted`.
export const deleteTodo = (
  state: Pick<State, "todos">,
  {
    id,
    analytics,
  }: { readonly id: number; readonly analytics: AnalyticsService },
): Pick<State, "todos"> => {
  analytics.todoDeleted();
  return { todos: state.todos.filter((todo) => todo.id !== id) };
};

const three = [
  { id: 1, name: "a", complete: false },
  { id: 2, name: "b", complete: true },
  { id: 3, name: "c", complete: false },
];

// Spec-owned cases, shared with the ecs `deleteTodo` transaction. `before` is a
// delta over `State.create()`; `after` lists only the written todos. The
// addressed todo is removed; an unknown id is a no-op. The transition logs
// `todoDeleted`. `before` ids are concrete (they address the delete); surviving
// `after` ids are left open (`Match.anyNumber`) — the ecs assigns its own.
export const cases: Conformance<typeof deleteTodo> = [
  {
    name: "removes a middle todo",
    before: { todos: [...three] },
    args: { id: entity(2), analytics: AnalyticsService.createFake() },
    after: {
      todos: [
        { id: Match.anyNumber, name: "a", complete: false },
        { id: Match.anyNumber, name: "c", complete: false },
      ],
    },
    effects: { analytics: [["todoDeleted"]] },
  },
  {
    name: "removes the first todo",
    before: { todos: [...three], displayCompleted: true },
    args: { id: entity(1), analytics: AnalyticsService.createFake() },
    after: {
      todos: [
        { id: Match.anyNumber, name: "b", complete: true },
        { id: Match.anyNumber, name: "c", complete: false },
      ],
    },
    effects: { analytics: [["todoDeleted"]] },
  },
  {
    name: "is a no-op for an unknown id but still logs the delete",
    before: { todos: [...three] },
    args: { id: entity(99), analytics: AnalyticsService.createFake() },
    after: {
      todos: [
        { id: Match.anyNumber, name: "a", complete: false },
        { id: Match.anyNumber, name: "b", complete: true },
        { id: Match.anyNumber, name: "c", complete: false },
      ],
    },
    effects: { analytics: [["todoDeleted"]] },
  },
];
