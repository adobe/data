// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe } from "vitest";
import { State } from "../../../../data/state/state.js";
import { cases } from "../../../../data/state/set-offer-code.test.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { setOfferCode } from "./set-offer-code.js";

describe("setOfferCode transaction conforms to State.setOfferCode", () => {
  expectConforms({
    cases,
    spec: State.setOfferCode,
    apply: setOfferCode,
  });
});
