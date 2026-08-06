// © 2026 Adobe. MIT License. See /LICENSE for details.
import { NameGeneratorService } from "../../services/name-generator-service/name-generator-service.js";
import { AnalyticsService } from "../../services/analytics-service/analytics-service.js";
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";
import { appendTodo } from "./append-todo.js";
import { anyNumber } from "./matchers.js";

/**
 * Async, service-injected transition: brackets the slow name generation with
 * analytics timing, then appends the todo via the shared {@link appendTodo} (so
 * it does NOT fire `todoCreated` — it logs its own `randomTodoAdded`). Awaiting an
 * async port makes it `Promise<State>`, but it stays deterministic given its
 * injected services — which is how it is unit-tested.
 */
export const createRandomTodo = async <T extends Pick<State, "todos">>(
  state: T,
  { nameGenerator, analytics }: {
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

// Spec-owned cases. Each injects deterministic doubles and authors `after` +
// `effects` against their published responses (`fakeNames`, `fakeTiming`). The
// value-returning reads (`randomTodoRequested`, `generateName`) are still calls on
// `analytics`, so — analytics being a declared service — its full call sequence is
// listed; `nameGenerator` is not declared, so its read is ignored.
export const cases: Conformance<typeof createRandomTodo> = [
  {
    name: "names the new todo from the generator and logs the timed add",
    before: { todos: [], displayCompleted: false },
    args: { nameGenerator: NameGeneratorService.createFake(), analytics: AnalyticsService.createFake() },
    after: {
      todos: [{ id: anyNumber, name: NameGeneratorService.fakeNames[0], complete: false }],
      displayCompleted: false,
    },
    effects: {
      analytics: [
        ["randomTodoRequested"],
        ["randomTodoAdded", { timing: AnalyticsService.fakeTiming, name: NameGeneratorService.fakeNames[0] }],
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
    after: { todos: [{ id: anyNumber, name: "only name", complete: false }], displayCompleted: false },
    effects: {
      analytics: [
        ["randomTodoRequested"],
        ["randomTodoAdded", { timing: AnalyticsService.fakeTiming, name: "only name" }],
      ],
    },
  },
];
