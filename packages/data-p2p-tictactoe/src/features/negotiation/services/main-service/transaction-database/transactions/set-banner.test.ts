// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe } from "vitest";
import { State } from "../../../../data/state/state.js";
import { cases } from "../../../../data/state/set-banner.test.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { setBanner } from "./set-banner.js";

describe("setBanner transaction conforms to State.setBanner", () => {
  expectConforms({
    cases,
    spec: State.setBanner,
    apply: setBanner,
  });
});
