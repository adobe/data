// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "@adobe/data/ecs";
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { unassignUser } from "./unassign-user.js";

// `todo` is an entity reference (marked in the `args` schema).
export const cases: Conformance.SpecCases<State, typeof unassignUser> = {
  args: { type: "object", properties: { todo: Entity.schema } },
  cases: [
    {
      name: "removes a user from a todo",
      before: { todos: new Map([[10, { name: "ship", complete: false, order: 0, assignees: ["ada", "linus"] }]]) },
      args: { todo: 10, name: "ada" },
      after: { todos: new Map([[10, { name: "ship", complete: false, order: 0, assignees: ["linus"] }]]) },
    },
    {
      name: "is a no-op for a user not assigned",
      before: { todos: new Map([[10, { name: "ship", complete: false, order: 0, assignees: ["linus"] }]]) },
      args: { todo: 10, name: "ada" },
      after: { todos: new Map([[10, { name: "ship", complete: false, order: 0, assignees: ["linus"] }]]) },
    },
    {
      name: "is a no-op for an id that names no todo",
      before: {
        users: new Map([[1, { user: true, name: "ada" }]]),
        todos: new Map([[10, { name: "ship", complete: false, order: 0, assignees: ["ada", "linus"] }]]),
      },
      args: { todo: 1, name: "ada" },
      after: {
        users: new Map([[1, { user: true, name: "ada" }]]),
        todos: new Map([[10, { name: "ship", complete: false, order: 0, assignees: ["ada", "linus"] }]]),
      },
    },
  ],
};
