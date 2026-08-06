// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe } from "vitest";
import { State } from "../../../../data/state/state.js";
import { cases } from "../../../../data/state/set-connection.test.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { setConnection } from "./set-connection.js";

describe("setConnection transaction conforms to State.setConnection", () => {
  expectConforms({
    cases,
    spec: State.setConnection,
    apply: setConnection,
  });
});
