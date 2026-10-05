// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "@adobe/data/ecs";
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { deleteTodo } from "./delete-todo.js";

// Inert cases for `deleteTodo`. The `args` schema marks `id` as an entity reference
// (the ecs side resolves the spec-id to its seeded entity). The addressed todo is
// removed and survivors keep their `order`; an unknown id is a no-op; the delete is
// logged unconditionally.
export const cases: Conformance.SpecCases<State, typeof deleteTodo> = {
  args: { type: "object", properties: { id: Entity.schema } },
  cases: [
    {
      name: "removes a middle todo",
      before: {
        entities: new Map([
          [1, { name: "a", complete: false, order: 0 }],
          [2, { name: "b", complete: true, order: 1 }],
          [3, { name: "c", complete: false, order: 2 }],
        ]),
      },
      args: { id: 2 },
      after: {
        entities: new Map([
          [1, { name: "a", complete: false, order: 0 }],
          [2, { name: "c", complete: false, order: 2 }],
        ]),
      },
      effects: { analytics: [["todoDeleted"]] },
    },
    {
      name: "removes the first todo",
      before: {
        entities: new Map([
          [1, { name: "a", complete: false, order: 0 }],
          [2, { name: "b", complete: true, order: 1 }],
          [3, { name: "c", complete: false, order: 2 }],
        ]),
        displayCompleted: true,
      },
      args: { id: 1 },
      after: {
        entities: new Map([
          [1, { name: "b", complete: true, order: 1 }],
          [2, { name: "c", complete: false, order: 2 }],
        ]),
      },
      effects: { analytics: [["todoDeleted"]] },
    },
    {
      name: "is a no-op for an unknown id but still logs the delete",
      before: {
        entities: new Map([
          [1, { name: "a", complete: false, order: 0 }],
          [2, { name: "b", complete: true, order: 1 }],
          [3, { name: "c", complete: false, order: 2 }],
        ]),
      },
      args: { id: 99 },
      after: {
        entities: new Map([
          [1, { name: "a", complete: false, order: 0 }],
          [2, { name: "b", complete: true, order: 1 }],
          [3, { name: "c", complete: false, order: 2 }],
        ]),
      },
      effects: { analytics: [["todoDeleted"]] },
    },
  ],
};
