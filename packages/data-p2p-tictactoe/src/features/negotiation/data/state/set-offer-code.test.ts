// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";
import { expectStateMatches } from "./expect-state-matches.js";

export const cases: readonly ConformanceCase<{ code: string }>[] = [
  {
    name: "stores the offer code and clears the banner",
    before: { ...State.create(), bannerText: "please wait" },
    args: { code: "OFFER-123" },
    after: { ...State.create(), offerCode: "OFFER-123" },
  },
];

describe("State.setOfferCode", () => {
  for (const { name, before, args, after } of cases) {
    it(name, () => {
      expectStateMatches(State.setOfferCode(before, args), after);
    });
  }
});
