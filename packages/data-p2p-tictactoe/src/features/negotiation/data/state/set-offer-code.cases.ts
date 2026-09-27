// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { setOfferCode } from "./set-offer-code.js";

// Inert, spec-owned cases for `setOfferCode`, shared with the ecs `setOfferCode`
// transaction and action.
export const cases: Conformance.SpecCases<State, typeof setOfferCode> = {
  cases: [
    {
      name: "stores the offer code and clears the banner",
      before: { bannerText: "please wait" },
      args: { code: "OFFER-123" },
      after: { offerCode: "OFFER-123", bannerText: "" },
    },
  ],
};
