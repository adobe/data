// © 2026 Adobe. MIT License. See /LICENSE for details.
import { AnalyticsService } from "../../services/analytics-service/analytics-service.js";
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";
import { anyNumber } from "./matchers.js";

export const deleteTodo = <T extends Pick<State, "todos">>(
  state: T,
  { id, analytics }: { readonly id: number; readonly analytics: AnalyticsService },
): T => {
  analytics.todoDeleted();
  return { ...state, todos: state.todos.filter((todo) => todo.id !== id) };
};

const three = [
  { id: 1, name: "a", complete: false },
  { id: 2, name: "b", complete: true },
  { id: 3, name: "c", complete: false },
];

// Spec-owned cases, shared with the ecs `deleteTodo` transaction. The addressed
// todo is removed; an unknown id is a no-op. The transition logs `todoDeleted`.
// `before` ids are concrete (they address the delete); surviving `after` ids are
// left open (`anyNumber`) — the ecs assigns its own.
export const cases: Conformance<typeof deleteTodo> = [
  {
    name: "removes a middle todo",
    before: { todos: [...three], displayCompleted: false },
    args: { id: 2, analytics: AnalyticsService.createFake() },
    after: {
      todos: [
        { id: anyNumber, name: "a", complete: false },
        { id: anyNumber, name: "c", complete: false },
      ],
      displayCompleted: false,
    },
    effects: { analytics: [["todoDeleted"]] },
  },
  {
    name: "removes the first todo",
    before: { todos: [...three], displayCompleted: true },
    args: { id: 1, analytics: AnalyticsService.createFake() },
    after: {
      todos: [
        { id: anyNumber, name: "b", complete: true },
        { id: anyNumber, name: "c", complete: false },
      ],
      displayCompleted: true,
    },
    effects: { analytics: [["todoDeleted"]] },
  },
  {
    name: "is a no-op for an unknown id but still logs the delete",
    before: { todos: [...three], displayCompleted: false },
    args: { id: 99, analytics: AnalyticsService.createFake() },
    after: {
      todos: [
        { id: anyNumber, name: "a", complete: false },
        { id: anyNumber, name: "b", complete: true },
        { id: anyNumber, name: "c", complete: false },
      ],
      displayCompleted: false,
    },
    effects: { analytics: [["todoDeleted"]] },
  },
];
