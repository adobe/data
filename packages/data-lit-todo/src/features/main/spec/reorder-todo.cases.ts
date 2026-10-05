// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "@adobe/data/ecs";
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { reorderTodo } from "./reorder-todo.js";

// Inert cases for the pure `reorderTodo` (no services). Shared with the ecs
// `dragTodo` transaction (its drop is the same move + `normalizeOrder`). The `args`
// schema marks `id` as an entity reference. Every case keeps all todos incomplete
// with `displayCompleted` true, so the visible list `dragTodo` indexes equals the
// full list; `after` lists RECOMPUTED contiguous `order`. The unknown-id no-op is
// exercised only by the pure transform — `dragTodo` has no such guard.
export const cases: Conformance.SpecCases<State, typeof reorderTodo> = {
  args: { type: "object", properties: { id: Entity.schema } },
  cases: [
    {
      name: "moves the first todo to the end",
      before: {
        entities: new Map([
          [1, { name: "a", complete: false, order: 0 }],
          [2, { name: "b", complete: false, order: 1 }],
          [3, { name: "c", complete: false, order: 2 }],
        ]),
        displayCompleted: true,
      },
      args: { id: 1, toIndex: 2 },
      after: {
        entities: new Map([
          [1, { name: "b", complete: false, order: 0 }],
          [2, { name: "c", complete: false, order: 1 }],
          [3, { name: "a", complete: false, order: 2 }],
        ]),
      },
    },
    {
      name: "moves the last todo to the front",
      before: {
        entities: new Map([
          [1, { name: "a", complete: false, order: 0 }],
          [2, { name: "b", complete: false, order: 1 }],
          [3, { name: "c", complete: false, order: 2 }],
        ]),
        displayCompleted: true,
      },
      args: { id: 3, toIndex: 0 },
      after: {
        entities: new Map([
          [1, { name: "c", complete: false, order: 0 }],
          [2, { name: "a", complete: false, order: 1 }],
          [3, { name: "b", complete: false, order: 2 }],
        ]),
      },
    },
    {
      name: "clamps an out-of-range index to the end",
      before: {
        entities: new Map([
          [1, { name: "a", complete: false, order: 0 }],
          [2, { name: "b", complete: false, order: 1 }],
          [3, { name: "c", complete: false, order: 2 }],
        ]),
        displayCompleted: true,
      },
      args: { id: 1, toIndex: 99 },
      after: {
        entities: new Map([
          [1, { name: "b", complete: false, order: 0 }],
          [2, { name: "c", complete: false, order: 1 }],
          [3, { name: "a", complete: false, order: 2 }],
        ]),
      },
    },
    {
      name: "keeps the order when moving to the same index",
      before: {
        entities: new Map([
          [1, { name: "a", complete: false, order: 0 }],
          [2, { name: "b", complete: false, order: 1 }],
          [3, { name: "c", complete: false, order: 2 }],
        ]),
        displayCompleted: true,
      },
      args: { id: 2, toIndex: 1 },
      after: {
        entities: new Map([
          [1, { name: "a", complete: false, order: 0 }],
          [2, { name: "b", complete: false, order: 1 }],
          [3, { name: "c", complete: false, order: 2 }],
        ]),
      },
    },
  ],
};
