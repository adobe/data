// © 2026 Adobe. MIT License. See /LICENSE for details.
import { AnalyticsService } from "../../services/analytics-service/analytics-service.js";
import type { State } from "./state.js";
import { entity, type Conformance } from "./conformance-case.js";
import { Match } from "@adobe/data-testing";

// Reads the todos, writes the todos — a `{ todos }` patch — flipping the
// addressed todo's `complete`; also logs `todoToggled`.
export const toggleComplete = (
  state: Pick<State, "todos">,
  {
    id,
    analytics,
  }: { readonly id: number; readonly analytics: AnalyticsService },
): Pick<State, "todos"> => {
  analytics.todoToggled();
  return {
    todos: state.todos.map((todo) =>
      todo.id === id ? { ...todo, complete: !todo.complete } : todo,
    ),
  };
};

// Spec-owned cases, shared with the ecs `toggleComplete` transaction. `before` is
// a delta over `State.create()`; `after` lists only the written todos. Only the
// addressed todo's `complete` flips; an unknown id is a no-op. The transition
// logs `todoToggled` unconditionally (as the action does). `before` ids address
// the toggle; `after` ids are left open (`Match.anyNumber`).
export const cases: Conformance<typeof toggleComplete> = [
  {
    name: "marks an incomplete todo complete",
    before: {
      todos: [
        { id: 1, name: "a", complete: false },
        { id: 2, name: "b", complete: false },
      ],
    },
    args: { id: entity(1), analytics: AnalyticsService.createFake() },
    after: {
      todos: [
        { id: Match.anyNumber, name: "a", complete: true },
        { id: Match.anyNumber, name: "b", complete: false },
      ],
    },
    effects: { analytics: [["todoToggled"]] },
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
    args: { id: entity(1), analytics: AnalyticsService.createFake() },
    after: {
      todos: [
        { id: Match.anyNumber, name: "a", complete: false },
        { id: Match.anyNumber, name: "b", complete: false },
      ],
    },
    effects: { analytics: [["todoToggled"]] },
  },
  {
    name: "is a no-op for an unknown id but still logs the toggle",
    before: {
      todos: [{ id: 1, name: "a", complete: false }],
    },
    args: { id: entity(99), analytics: AnalyticsService.createFake() },
    after: {
      todos: [{ id: Match.anyNumber, name: "a", complete: false }],
    },
    effects: { analytics: [["todoToggled"]] },
  },
];
