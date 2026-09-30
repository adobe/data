// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { createTodo } from "./create-todo.js";

// Inert cases for `createTodo`. `args` carries only data (`name`, optional
// `complete`); the injected `analytics` double is synthesized by the runner and its
// call asserted in `effects`. `before`/`after` are keyed by plain spec-ids and
// compared up to an id-bijection. `complete` defaults to false.
export const cases: Conformance.SpecCases<State, typeof createTodo> = {
  cases: [
    {
      name: "appends the first todo to an empty list",
      before: {},
      args: { name: "a" },
      after: {
        entities: new Map([[1, { name: "a", complete: false, order: 0 }]]),
      },
      effects: { analytics: [["todoCreated", { name: "a" }]] },
    },
    {
      name: "appends a complete todo",
      before: {
        entities: new Map([[1, { name: "a", complete: false, order: 0 }]]),
      },
      args: { name: "b", complete: true },
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
      args: { name: "d" },
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
  ],
};
