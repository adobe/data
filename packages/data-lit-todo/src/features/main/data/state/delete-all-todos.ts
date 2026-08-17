// © 2026 Adobe. MIT License. See /LICENSE for details.
import { AnalyticsService } from "../../services/analytics-service/analytics-service.js";
import type { Services } from "../../services/services.js";
import type { State } from "./state.js";
import type { Todo } from "../todo/todo.js";
import { Conformance } from "./conformance-case.js";

// Reads the entities, writes the entities — an `{ entities }` patch — clearing
// them; `displayCompleted` is untouched. Logs `allTodosCleared`.
export const deleteAllTodos = (
  state: Pick<State, "entities">,
  { analytics }: Pick<Services, "analytics">,
): Pick<State, "entities"> => {
  analytics.allTodosCleared();
  return { entities: new Map<number, Todo>() };
};

// Spec-owned cases, shared with the ecs `deleteAllTodos` transaction. `before` is
// a delta over `State.create()`; `after` lists only the written entities (empty).
// Every todo is removed and `displayCompleted` is untouched; the transition logs
// `allTodosCleared` (as the action does).
export const cases = Conformance.cases(deleteAllTodos,
  {
    name: "empties a populated list, preserving displayCompleted",
    before: {
      entities: new Map([
        [1, { name: "a", complete: false, order: 0 }],
        [2, { name: "b", complete: true, order: 1 }],
        [3, { name: "c", complete: false, order: 2 }],
      ]),
      displayCompleted: true,
    },
    args: { analytics: AnalyticsService.createFake() },
    after: { entities: new Map<number, Todo>() },
    effects: { analytics: [["allTodosCleared"]] },
  },
  {
    name: "is a no-op on an already empty list but still logs the clear",
    before: {},
    args: { analytics: AnalyticsService.createFake() },
    after: { entities: new Map<number, Todo>() },
    effects: { analytics: [["allTodosCleared"]] },
  },
);
