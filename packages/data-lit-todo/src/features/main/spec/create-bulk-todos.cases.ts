// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { createBulkTodos } from "./create-bulk-todos.js";

// Inert cases for `createBulkTodos`. `count` (floored, clamped at 0) numbered todos
// are appended; the `bulkTodosCreated` effect logs the raw count, even on a no-op.
export const cases: Conformance.SpecCases<State, typeof createBulkTodos> = {
  cases: [
    {
      name: "appends count numbered todos to an empty list",
      before: {},
      args: { count: 3 },
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
      args: { count: 2 },
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
      args: { count: 2.9 },
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
      args: { count: 0 },
      after: {
        entities: new Map([[1, { name: "a", complete: false, order: 0 }]]),
      },
      effects: { analytics: [["bulkTodosCreated", { count: 0 }]] },
    },
  ],
};
