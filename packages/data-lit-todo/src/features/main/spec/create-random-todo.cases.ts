// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { createRandomTodo } from "./create-random-todo.js";

// Inert cases for the value-returning, service-injected `createRandomTodo`. The
// doubles' RETURNS are scheduled as data in `responses` — the case OWNS the name the
// generator yields and the `{ startedAt: 0 }` timing the analytics port hands back —
// so `after`/`effects` never guess at a value the fake invented. `nameGenerator` is
// a read (value-returning), so it is scheduled but not asserted; `analytics`'
// fire-and-forget calls are asserted in `effects`, and the timing it returned flows
// verbatim into `randomTodoAdded`.
export const cases: Conformance.SpecCases<State, typeof createRandomTodo> = {
  cases: [
    {
      name: "names the new todo from the generator and logs the timed add",
      before: {},
      responses: {
        nameGenerator: { generateName: ["random task"] },
        analytics: { randomTodoRequested: [{ startedAt: 0 }] },
      },
      after: {
        entities: new Map([[1, { name: "random task", complete: false, order: 0 }]]),
      },
      effects: {
        analytics: [
          ["randomTodoRequested"],
          ["randomTodoAdded", { timing: { startedAt: 0 }, name: "random task" }],
        ],
      },
    },
    {
      name: "uses an explicit response schedule when supplied",
      before: {},
      responses: {
        nameGenerator: { generateName: ["only name"] },
        analytics: { randomTodoRequested: [{ startedAt: 0 }] },
      },
      after: {
        entities: new Map([[1, { name: "only name", complete: false, order: 0 }]]),
      },
      effects: {
        analytics: [
          ["randomTodoRequested"],
          ["randomTodoAdded", { timing: { startedAt: 0 }, name: "only name" }],
        ],
      },
    },
  ],
};
