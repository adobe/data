// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { State } from "./state.js";
import { cases } from "./reorder-todo.cases.js";
import { expectStateMatches } from "./expect-state-matches.js";

describe("State.reorderTodo", () => {
  for (const { name, before, args, after } of cases) {
    it(name, () => expectStateMatches(State.reorderTodo(before, args), after));
  }

  // Unknown-id no-op: pure-transform-only. The ecs `dragTodo` is always driven
  // with a real entity, so this branch has no conformance counterpart.
  it("returns the same state reference for an unknown id", () => {
    const s: State = {
      todos: [
        { id: 1, name: "a", complete: false },
        { id: 2, name: "b", complete: false },
      ],
      displayCompleted: true,
    };
    expect(State.reorderTodo(s, { id: 42, toIndex: 0 })).toBe(s);
  });
});
