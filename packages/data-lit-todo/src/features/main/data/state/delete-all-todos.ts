// © 2026 Adobe. MIT License. See /LICENSE for details.
import { AnalyticsService } from "../../services/analytics-service/analytics-service.js";
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";

export const deleteAllTodos = <T extends Pick<State, "todos">>(
  state: T,
  { analytics }: { readonly analytics: AnalyticsService },
): T => {
  analytics.allTodosCleared();
  return { ...state, todos: [] };
};

// Spec-owned cases, shared with the ecs `deleteAllTodos` transaction. Every todo
// is removed and `displayCompleted` is untouched; the transition logs
// `allTodosCleared` (as the action does).
export const cases: Conformance<typeof deleteAllTodos> = [
  {
    name: "empties a populated list, preserving displayCompleted",
    before: {
      todos: [
        { id: 1, name: "a", complete: false },
        { id: 2, name: "b", complete: true },
        { id: 3, name: "c", complete: false },
      ],
      displayCompleted: true,
    },
    args: { analytics: AnalyticsService.createFake() },
    after: { todos: [], displayCompleted: true },
    effects: { analytics: [["allTodosCleared"]] },
  },
  {
    name: "is a no-op on an already empty list but still logs the clear",
    before: { todos: [], displayCompleted: false },
    args: { analytics: AnalyticsService.createFake() },
    after: { todos: [], displayCompleted: false },
    effects: { analytics: [["allTodosCleared"]] },
  },
];
