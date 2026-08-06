// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";
import { expectStateMatches } from "./expect-state-matches.js";

export const cases: readonly ConformanceCase<void>[] = [
  {
    name: "enters join-signaling as joiner, connecting, clearing the banner",
    before: { ...State.create(), bannerText: "stale", bannerError: true },
    args: undefined,
    after: {
      ...State.create(),
      phase: "join-signaling",
      role: "joiner",
      connection: "connecting",
    },
  },
];

describe("State.startJoinSignaling", () => {
  for (const { name, before, after } of cases) {
    it(name, () => {
      expectStateMatches(State.startJoinSignaling(before), after);
    });
  }
});
