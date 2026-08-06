// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `clearLog` conforms to `State.clearLog`: it empties the log, leaving count and
// name untouched.
import { describe } from "vitest";
import { State } from "../../../../data/state/state.js";
import { cases } from "../../../../data/state/clear-log.test.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { clearLog } from "./clear-log.js";

describe("clearLog transaction conforms to State.clearLog", () => {
  expectConforms({
    cases,
    spec: State.clearLog,
    apply: (store) => clearLog(store),
  });
});
