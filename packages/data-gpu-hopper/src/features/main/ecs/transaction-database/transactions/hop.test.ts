// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `hop` conforms to `State.hop`. Both take a plain direction, so `apply` calls
// the raw transaction directly on the seeded store — no entity resolution
// needed. Every direction, edge clamp, the grid-snap, and the game-over no-op
// are covered by the shared spec cases.
import { describe } from "vitest";
import { State } from "../../../data/state/state.js";
import { cases } from "../../../data/state/hop.cases.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { hop } from "./hop.js";

describe("hop transaction conforms to State.hop", () => {
  expectConforms({
    cases,
    spec: State.hop,
    apply: hop,
  });
});
