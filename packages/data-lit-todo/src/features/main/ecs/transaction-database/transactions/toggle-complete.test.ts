// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `toggleComplete` conforms to `State.toggleComplete`: it flips only the
// addressed todo's `complete` flag and is a no-op for an unknown id. The spec
// `id` is the seeded entity id (see `fromState`), passed straight through.
import { describe } from "vitest";
import { State } from "../../../data/state/state.js";
import { cases } from "../../../data/state/toggle-complete.cases.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { toggleComplete } from "./toggle-complete.js";

describe("toggleComplete transaction conforms to State.toggleComplete", () => {
  expectConforms({
    cases,
    spec: State.toggleComplete,
    apply: (store, args) => toggleComplete(store, args.id),
  });
});
