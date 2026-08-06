// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe } from "vitest";
import { State } from "../../../../data/state/state.js";
import { cases } from "../../../../data/state/set-joiner-offer-input.test.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { setJoinerOfferInput } from "./set-joiner-offer-input.js";

describe("setJoinerOfferInput transaction conforms to State.setJoinerOfferInput", () => {
  expectConforms({
    cases,
    spec: State.setJoinerOfferInput,
    apply: setJoinerOfferInput,
  });
});
