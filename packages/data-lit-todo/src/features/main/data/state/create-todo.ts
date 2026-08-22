// © 2026 Adobe. MIT License. See /LICENSE for details.
import { AnalyticsService } from "../../services/analytics-service/analytics-service.js";
import type { Services } from "../../services/services.js";
import type { State } from "./state.js";
import { Conformance } from "./conformance-case.js";
import { appendTodo } from "./append-todo.js";

// Reads the entities, writes the entities — an `{ entities }` patch — by
// delegating to the shared `appendTodo`; also logs `todoCreated`.
export const createTodo = (
  state: Pick<State, "entities">,
  {
    name,
    complete,
    analytics,
  }: {
    readonly name: string;
    readonly complete?: boolean;
  } & Pick<Services, "analytics">,
): Pick<State, "entities"> => {
  analytics.todoCreated({ name });
  return appendTodo(state, { name, complete });
};

// Spec-owned cases, shared with the ecs `createTodo` transaction. `before` is a
// delta over `State.create()` (empty entities, completed hidden); the `before`
// map is keyed by PLAIN spec-id numbers. `after` lists only what the transition
// writes — the entities — keyed by plain spec-ids (the ecs mints its own ids; conformance compares
// up to an id-bijection; values are id-less and compare by content). `complete` defaults to false; it logs `todoCreated`.
export const cases = /*@__PURE__*/ Conformance.cases(createTodo,
  {
    name: "appends the first todo to an empty list",
    before: {},
    args: { name: "a", analytics: AnalyticsService.createFake() },
    after: {
      entities: new Map([
        [1, { name: "a", complete: false, order: 0 }],
      ]),
    },
    effects: { analytics: [["todoCreated", { name: "a" }]] },
  },
  {
    name: "appends a complete todo",
    before: {
      entities: new Map([[1, { name: "a", complete: false, order: 0 }]]),
    },
    args: {
      name: "b",
      complete: true,
      analytics: AnalyticsService.createFake(),
    },
    after: {
      entities: new Map([
        [1, { name: "a", complete: false, order: 0 }],
        [2, { name: "b", complete: true, order: 1 }],
      ]),
    },
    effects: { analytics: [["todoCreated", { name: "b" }]] },
  },
  {
    name: "appends onto a longer list",
    before: {
      entities: new Map([
        [1, { name: "a", complete: false, order: 0 }],
        [2, { name: "b", complete: true, order: 1 }],
        [3, { name: "c", complete: false, order: 2 }],
      ]),
      displayCompleted: true,
    },
    args: { name: "d", analytics: AnalyticsService.createFake() },
    after: {
      entities: new Map([
        [1, { name: "a", complete: false, order: 0 }],
        [2, { name: "b", complete: true, order: 1 }],
        [3, { name: "c", complete: false, order: 2 }],
        [4, { name: "d", complete: false, order: 3 }],
      ]),
    },
    effects: { analytics: [["todoCreated", { name: "d" }]] },
  },
);
