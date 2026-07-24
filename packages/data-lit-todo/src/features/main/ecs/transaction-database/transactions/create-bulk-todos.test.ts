// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `createBulkTodos` conforms to `State.createBulkTodos`: it appends `count`
// (floored, clamped at 0) numbered placeholder todos after the existing ones.
import { describe } from "vitest";
import { State } from "../../../data/state/state.js";
import { cases } from "../../../data/state/create-bulk-todos.cases.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { createBulkTodos } from "./create-bulk-todos.js";

describe("createBulkTodos transaction conforms to State.createBulkTodos", () => {
  expectConforms({
    cases,
    spec: State.createBulkTodos,
    apply: createBulkTodos,
  });
});
