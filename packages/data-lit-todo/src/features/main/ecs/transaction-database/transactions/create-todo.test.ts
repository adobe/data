// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `createTodo` conforms to `State.createTodo`: it appends one todo with the next
// order and the defaulted `complete` flag, leaving existing todos untouched.
import { describe } from "vitest";
import { State } from "../../../data/state/state.js";
import { cases } from "../../../data/state/create-todo.cases.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { createTodo } from "./create-todo.js";

describe("createTodo transaction conforms to State.createTodo", () => {
  expectConforms({
    cases,
    spec: (before, args) => State.createTodo(before, args),
    apply: (store, args) => createTodo(store, args),
  });
});
