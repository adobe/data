// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";
import { expectStateMatches } from "./expect-state-matches.js";

export const cases: readonly ConformanceCase<void>[] = [
  {
    name: "enters host-signaling as host, connecting, with a waiting banner",
    before: State.create(),
    args: undefined,
    after: {
      ...State.create(),
      phase: "host-signaling",
      role: "host",
      connection: "connecting",
      bannerText: "Generating invite code — please wait…",
    },
  },
];

describe("State.startHostSignaling", () => {
  for (const { name, before, after } of cases) {
    it(name, () => {
      expectStateMatches(State.startHostSignaling(before), after);
    });
  }
});
