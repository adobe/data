// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";
import { expectStateMatches } from "./expect-state-matches.js";

export const cases: readonly ConformanceCase<void>[] = [
  {
    name: "moves to the game phase, connected",
    before: { ...State.create(), phase: "host-signaling", role: "host", connection: "connecting" },
    args: undefined,
    after: { ...State.create(), phase: "game", role: "host", connection: "connected" },
  },
];

describe("State.enterGame", () => {
  for (const { name, before, after } of cases) {
    it(name, () => {
      expectStateMatches(State.enterGame(before), after);
    });
  }
});
