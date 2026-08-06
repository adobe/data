// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `setFilter` conforms to `State.setFilter`: it replaces the scene-wide filter
// resource and leaves sprites untouched.
import { describe } from "vitest";
import { State } from "../../../../data/state/state.js";
import { cases } from "../../../../data/state/set-filter.test.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { setFilter } from "./set-filter.js";

describe("setFilter transaction conforms to State.setFilter", () => {
  expectConforms({
    cases,
    spec: State.setFilter,
    apply: (store, args) => setFilter(store, args),
  });
});
