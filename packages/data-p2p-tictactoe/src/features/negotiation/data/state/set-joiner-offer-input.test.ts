// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";
import { expectStateMatches } from "./expect-state-matches.js";

export const cases: readonly ConformanceCase<{ value: string }>[] = [
  {
    name: "stores the joiner offer input",
    before: State.create(),
    args: { value: "OFFER-xyz" },
    after: { ...State.create(), joinerOfferInput: "OFFER-xyz" },
  },
];

describe("State.setJoinerOfferInput", () => {
  for (const { name, before, args, after } of cases) {
    it(name, () => {
      expectStateMatches(State.setJoinerOfferInput(before, args), after);
    });
  }
});
