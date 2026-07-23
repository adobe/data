// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { State } from "./state.js";
import { cases } from "./create-bulk-todos.cases.js";
import { expectStateMatches } from "./expect-state-matches.js";

describe("State.createBulkTodos", () => {
  for (const { name, before, args, after } of cases) {
    it(name, () => expectStateMatches(State.createBulkTodos(before, args), after));
  }
});
