// © 2026 Adobe. MIT License. See /LICENSE for details.
import { NameGeneratorService } from "../../services/name-generator-service/name-generator-service.js";
import { AnalyticsService } from "../../services/analytics-service/analytics-service.js";
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";
import { appendTodo } from "./append-todo.js";
import { Match } from "@adobe/data/testing";
/**
 * Async, service-injected transition: brackets the slow name generation with
 * analytics timing, then appends the todo via the shared {@link appendTodo} (so
 * it does NOT fire `todoCreated` — it logs its own `randomTodoAdded`). Awaiting an
 * async port makes it `Promise<State>`, but it stays deterministic given its
 * injected services — which is how it is unit-tested.
 */
export const createRandomTodo = async <T extends Pick<State, "todos">>(
  state: T,
  {
    nameGenerator,
    analytics,
  }: {
    readonly nameGenerator: NameGeneratorService;
    readonly analytics: AnalyticsService;
  },
): Promise<T> => {
  const timing = await analytics.randomTodoRequested();
  const name = await nameGenerator.generateName();
  const next = appendTodo(state, { name });
  analytics.randomTodoAdded({ timing, name });
  return next;
};

// Spec-owned cases. Each injects deterministic doubles with the exact responses
// it needs and authors `after` + `effects` against those self-owned values (the
// name it schedules, the fixed `{ startedAt: 0 }` timing the analytics double
// resolves). The value-returning reads (`randomTodoRequested`, `generateName`)
// are still calls on `analytics`, so — analytics being a declared service — its
// full call sequence is listed; `nameGenerator` is not declared, so its read is
// ignored.
export const cases: Conformance<typeof createRandomTodo> = [
  {
    name: "names the new todo from the generator and logs the timed add",
    before: { todos: [], displayCompleted: false },
    args: {
      nameGenerator: NameGeneratorService.createFake(["random task"]),
      analytics: AnalyticsService.createFake(),
    },
    after: {
      todos: [
        {
          id: Match.anyNumber,
          name: "random task",
          complete: false,
        },
      ],
      displayCompleted: false,
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
    before: { todos: [], displayCompleted: false },
    args: {
      nameGenerator: NameGeneratorService.createFake(["only name"]),
      analytics: AnalyticsService.createFake(),
    },
    after: {
      todos: [{ id: Match.anyNumber, name: "only name", complete: false }],
      displayCompleted: false,
    },
    effects: {
      analytics: [
        ["randomTodoRequested"],
        ["randomTodoAdded", { timing: { startedAt: 0 }, name: "only name" }],
      ],
    },
  },
];
