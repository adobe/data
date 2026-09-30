// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { addUser } from "./add-user.js";

export const cases: Conformance.SpecCases<State, typeof addUser> = {
  cases: [
    {
      name: "adds a user by trimmed name",
      before: {},
      args: { name: "  ada " },
      after: { users: new Map([[1, { user: true, name: "ada" }]]) },
    },
    {
      name: "ignores a duplicate name",
      before: { users: new Map([[1, { user: true, name: "ada" }]]) },
      args: { name: "ada" },
      after: { users: new Map([[1, { user: true, name: "ada" }]]) },
    },
    {
      name: "ignores a blank name",
      before: {},
      args: { name: "   " },
      after: { users: new Map() },
    },
    {
      name: "can share a name with a todo",
      before: { todos: new Map([[10, { name: "ada", complete: false, order: 0, assignees: [] }]]) },
      args: { name: "ada" },
      after: { users: new Map([[11, { user: true, name: "ada" }]]) },
    },
  ],
};
