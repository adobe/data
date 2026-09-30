// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { setJoinerOfferInput } from "./set-joiner-offer-input.js";

// Inert cases for `setJoinerOfferInput`, run against the pure spec and the
// `setJoinerOfferInput` action.
export const cases: Conformance.SpecCases<State, typeof setJoinerOfferInput> = {
  cases: [
    {
      name: "stores the joiner offer input",
      before: {},
      args: { value: "OFFER-xyz" },
      after: { joinerOfferInput: "OFFER-xyz" },
    },
  ],
};
