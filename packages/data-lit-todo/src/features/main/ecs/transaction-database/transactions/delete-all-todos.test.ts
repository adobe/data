// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `deleteAllTodos` conforms to `State.deleteAllTodos`: it clears every todo,
// leaving `displayCompleted` untouched.
import { describe } from "vitest";
import { State } from "../../../data/state/state.js";
import { cases } from "../../../data/state/delete-all-todos.cases.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { deleteAllTodos } from "./delete-all-todos.js";

describe("deleteAllTodos transaction conforms to State.deleteAllTodos", () => {
  expectConforms({
    cases,
    spec: State.deleteAllTodos,
    apply: deleteAllTodos,
  });
});
