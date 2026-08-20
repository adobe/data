// © 2026 Adobe. MIT License. See /LICENSE for details.
import { NameGeneratorService } from "../../services/name-generator-service/name-generator-service.js";
import { AnalyticsService } from "../../services/analytics-service/analytics-service.js";
import type { Services } from "../../services/services.js";
import type { State } from "./state.js";
import { Conformance } from "./conformance-case.js";
import { appendTodo } from "./append-todo.js";
/**
 * Async, service-injected transition: brackets the slow name generation with
 * analytics timing, then appends the todo via the shared {@link appendTodo} (so
 * it does NOT fire `todoCreated` — it logs its own `randomTodoAdded`). Reads and
 * writes the entities — an `{ entities }` patch. Awaiting an async port makes it
 * `Promise<Pick<State, "entities">>`, but it stays deterministic given its
 * injected services — which is how it is unit-tested.
 */
export const createRandomTodo = async (
  state: Pick<State, "entities">,
  {
    nameGenerator,
    analytics,
  }: Pick<Services, "nameGenerator" | "analytics">,
): Promise<Pick<State, "entities">> => {
  const timing = await analytics.randomTodoRequested();
  const name = await nameGenerator.generateName();
  const next = appendTodo(state, { name });
  analytics.randomTodoAdded({ timing, name });
  return next;
};

// Spec-owned cases. `before` is a delta over `State.create()`; `after` lists only
// the written entities with plain spec-id keys. Each injects deterministic
// doubles with the exact responses it needs and authors `after` + `effects` against
// those self-owned values (the name it schedules, the fixed `{ startedAt: 0 }`
// timing the analytics double resolves). The value-returning reads
// (`randomTodoRequested`, `generateName`) are still calls on `analytics`, so — it
// being a declared service — its full call sequence is listed; `nameGenerator` is
// not declared, so its read is ignored.
export const cases = /*@__PURE__*/ Conformance.cases(createRandomTodo,
  {
    name: "names the new todo from the generator and logs the timed add",
    before: {},
    args: {
      nameGenerator: NameGeneratorService.createFake(["random task"]),
      analytics: AnalyticsService.createFake(),
    },
    after: {
      entities: new Map([
        [1, { name: "random task", complete: false, order: 0 }],
      ]),
    },
    effects: {
      analytics: [
        ["randomTodoRequested"],
        [
          "randomTodoAdded",
          {
            timing: { startedAt: 0 },
            name: "random task",
          },
        ],
      ],
    },
  },
  {
    name: "uses an explicit response schedule when supplied",
    before: {},
    args: {
      nameGenerator: NameGeneratorService.createFake(["only name"]),
      analytics: AnalyticsService.createFake(),
    },
    after: {
      entities: new Map([
        [1, { name: "only name", complete: false, order: 0 }],
      ]),
    },
    effects: {
      analytics: [
        ["randomTodoRequested"],
        ["randomTodoAdded", { timing: { startedAt: 0 }, name: "only name" }],
      ],
    },
  },
);
