// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `tick` conforms to `State.tick`: every sprite's rotation advances by
// delta * 0.1.
import { describe } from "vitest";
import { State } from "../../../../data/state/state.js";
import { cases } from "../../../../data/state/tick.test.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { tick } from "./tick.js";

describe("tick transaction conforms to State.tick", () => {
  expectConforms({
    cases,
    spec: State.tick,
    apply: (store, args) => tick(store, args),
  });
});
