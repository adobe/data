// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { tasksByUser } from "./tasks-by-user.js";

export const cases: Conformance.SpecDerivations<typeof tasksByUser> = {
  cases: [
    {
      name: "lists each user's todos in display order",
      input: {
        users: new Map([
          [1, { user: true, name: "linus" }],
          [2, { user: true, name: "ada" }],
        ]),
        todos: new Map([
          [10, { name: "review", complete: false, order: 1, assignees: ["ada"] }],
          [11, { name: "ship", complete: false, order: 0, assignees: ["ada", "linus"] }],
          [12, { name: "idle", complete: false, order: 2, assignees: [] }],
        ]),
      },
      value: [
        { user: "ada", tasks: ["ship", "review"] },
        { user: "linus", tasks: ["ship"] },
      ],
    },
    {
      name: "a user with no todos has no tasks",
      input: { users: new Map([[1, { user: true, name: "ada" }]]), todos: new Map() },
      value: [{ user: "ada", tasks: [] }],
    },
  ],
};
