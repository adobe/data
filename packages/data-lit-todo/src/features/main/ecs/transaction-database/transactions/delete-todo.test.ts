// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `deleteTodo` conforms to `State.deleteTodo`: it removes the addressed todo and
// is a no-op for an unknown id. The spec `id` is the seeded entity id (see
// `fromState`), so `apply` passes it straight through.
import { describe } from "vitest";
import { State } from "../../../data/state/state.js";
import { cases } from "../../../data/state/delete-todo.cases.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { deleteTodo } from "./delete-todo.js";

describe("deleteTodo transaction conforms to State.deleteTodo", () => {
  expectConforms({
    cases,
    spec: (before, args) => State.deleteTodo(before, args),
    apply: (store, args) => deleteTodo(store, args.id),
  });
});
