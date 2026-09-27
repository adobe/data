// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "@adobe/data/ecs";
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { selectTodo } from "./select-todo.js";

// Inert cases for the pure `selectTodo`. The `args` schema marks `id` as an entity
// reference, and `after` writes `selectedTodo` as the plain spec-id of the referenced
// todo; the round-trip compares the reference up to an id-bijection, so it lines up
// with the same entity's map key on both spec and ecs sides.
export const cases: Conformance.SpecCases<State, typeof selectTodo> = {
  args: { type: "object", properties: { id: Entity.schema } },
  cases: [
    {
      name: "selects an existing todo",
      before: {
        entities: new Map([
          [1, { name: "a", complete: false, order: 0 }],
          [2, { name: "b", complete: false, order: 1 }],
          [3, { name: "c", complete: false, order: 2 }],
        ]),
      },
      args: { id: 2 },
      after: { selectedTodo: 2 },
    },
    {
      name: "leaves the selection unchanged for an id that names no todo",
      before: {
        entities: new Map([
          [1, { name: "a", complete: false, order: 0 }],
          [2, { name: "b", complete: false, order: 1 }],
          [3, { name: "c", complete: false, order: 2 }],
        ]),
        selectedTodo: 1,
      },
      args: { id: 99 },
      after: { selectedTodo: 1 },
    },
  ],
};
