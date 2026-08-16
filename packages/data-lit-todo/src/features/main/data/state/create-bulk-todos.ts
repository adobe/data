// © 2026 Adobe. MIT License. See /LICENSE for details.
import { AnalyticsService } from "../../services/analytics-service/analytics-service.js";
import type { Services } from "../../services/services.js";
import type { State } from "./state.js";
import { Conformance } from "./conformance-case.js";
import { appendTodo } from "./append-todo.js";
/** Adds numbered placeholder todos for demos and performance testing. Reads and
 * writes the entities — an `{ entities }` patch. */
export const createBulkTodos = (
  state: Pick<State, "entities">,
  {
    count,
    analytics,
  }: { readonly count: number } & Pick<Services, "analytics">,
): Pick<State, "entities"> => {
  analytics.bulkTodosCreated({ count });
  const total = Math.max(0, Math.floor(count));
  let next: Pick<State, "entities"> = state;
  for (let index = 0; index < total; index++) {
    next = appendTodo(next, { name: `Todo ${state.entities.size + index}` });
  }
  return next;
};

// Spec-owned cases, shared with the ecs `createBulkTodos` transaction. `before`
// is a delta over `State.create()` (plain spec-id keys); `after` lists only the
// written entities with plain spec-id keys. `count` (floored, clamped at 0)
// numbered todos are appended; the transition logs `bulkTodosCreated` with the raw
// count (as the action does), even on a no-op.
export const cases = Conformance.cases(createBulkTodos,
  {
    name: "appends count numbered todos to an empty list",
    before: {},
    args: { count: 3, analytics: AnalyticsService.createFake() },
    after: {
      entities: new Map([
        [1, { name: "Todo 0", complete: false, order: 0 }],
        [2, { name: "Todo 1", complete: false, order: 1 }],
        [3, { name: "Todo 2", complete: false, order: 2 }],
      ]),
    },
    effects: { analytics: [["bulkTodosCreated", { count: 3 }]] },
  },
  {
    name: "continues names after existing todos",
    before: {
      entities: new Map([[1, { name: "a", complete: false, order: 0 }]]),
    },
    args: { count: 2, analytics: AnalyticsService.createFake() },
    after: {
      entities: new Map([
        [1, { name: "a", complete: false, order: 0 }],
        [2, { name: "Todo 1", complete: false, order: 1 }],
        [3, { name: "Todo 2", complete: false, order: 2 }],
      ]),
    },
    effects: { analytics: [["bulkTodosCreated", { count: 2 }]] },
  },
  {
    name: "floors a fractional count",
    before: {},
    args: { count: 2.9, analytics: AnalyticsService.createFake() },
    after: {
      entities: new Map([
        [1, { name: "Todo 0", complete: false, order: 0 }],
        [2, { name: "Todo 1", complete: false, order: 1 }],
      ]),
    },
    effects: { analytics: [["bulkTodosCreated", { count: 2.9 }]] },
  },
  {
    name: "is a no-op for count 0 but still logs the request",
    before: {
      entities: new Map([[1, { name: "a", complete: false, order: 0 }]]),
      displayCompleted: true,
    },
    args: { count: 0, analytics: AnalyticsService.createFake() },
    after: {
      entities: new Map([
        [1, { name: "a", complete: false, order: 0 }],
      ]),
    },
    effects: { analytics: [["bulkTodosCreated", { count: 0 }]] },
  },
);
