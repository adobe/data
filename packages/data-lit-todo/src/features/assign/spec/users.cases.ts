// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { users } from "./users.js";

export const cases: Conformance.SpecDerivations<typeof users> = {
  cases: [
    { name: "is empty with no users", input: { users: new Map() }, value: [] },
    {
      name: "lists users sorted by name",
      input: {
        users: new Map([
          [1, { user: true, name: "linus" }],
          [2, { user: true, name: "ada" }],
        ]),
      },
      value: [
        { user: true, name: "ada" },
        { user: true, name: "linus" },
      ],
    },
  ],
};
