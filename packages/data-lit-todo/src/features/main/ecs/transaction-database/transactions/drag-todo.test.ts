// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `dragTodo`'s final drop conforms to `State.reorderTodo`: assigning a fractional
// `order` between the new visible neighbours then normalizing back to contiguous
// integers reproduces the pure list move. The shared cases keep every todo
// incomplete with `displayCompleted` true, so the visible list `dragTodo` indexes
// equals the full list `reorderTodo` indexes — `finalIndex` maps to `toIndex`.
// The spec `id` is the seeded entity id (see `fromState`), passed as `entity`.
import { describe } from "vitest";
import { State } from "../../../data/state/state.js";
import { cases } from "../../../data/state/reorder-todo.cases.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { dragTodo } from "./drag-todo.js";

describe("dragTodo transaction conforms to State.reorderTodo", () => {
  expectConforms({
    cases,
    spec: (before, args) => State.reorderTodo(before, args),
    apply: (store, args) =>
      dragTodo(store, { entity: args.id, dragPosition: 0, finalIndex: args.toIndex }),
  });
});
