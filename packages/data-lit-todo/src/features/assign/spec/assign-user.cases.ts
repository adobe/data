// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "@adobe/data/ecs";
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { assignUser } from "./assign-user.js";

// `todo` is an entity reference (marked in the `args` schema).
export const cases: Conformance.SpecCases<State, typeof assignUser> = {
  args: { type: "object", properties: { todo: Entity.schema } },
  cases: [
    {
      name: "assigns a user to a todo",
      before: { todos: new Map([[10, { name: "ship", complete: false, order: 0, assignees: [] }]]) },
      args: { todo: 10, name: "ada" },
      after: { todos: new Map([[10, { name: "ship", complete: false, order: 0, assignees: ["ada"] }]]) },
    },
    {
      name: "is idempotent for an already-assigned user",
      before: { todos: new Map([[10, { name: "ship", complete: false, order: 0, assignees: ["ada"] }]]) },
      args: { todo: 10, name: "ada" },
      after: { todos: new Map([[10, { name: "ship", complete: false, order: 0, assignees: ["ada"] }]]) },
    },
    {
      name: "is a no-op for an id that names no todo",
      before: {
        users: new Map([[1, { user: true, name: "ada" }]]),
        todos: new Map([[10, { name: "ship", complete: false, order: 0, assignees: [] }]]),
      },
      args: { todo: 1, name: "ada" },
      after: {
        users: new Map([[1, { user: true, name: "ada" }]]),
        todos: new Map([[10, { name: "ship", complete: false, order: 0, assignees: [] }]]),
      },
    },
  ],
};
