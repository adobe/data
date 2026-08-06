// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";
import { expectStateMatches } from "./expect-state-matches.js";

export const cases: readonly ConformanceCase<{ text: string; error?: boolean }>[] = [
  {
    name: "sets an informational banner",
    before: State.create(),
    args: { text: "Generating answer — please wait…" },
    after: { ...State.create(), bannerText: "Generating answer — please wait…" },
  },
  {
    name: "sets an error banner",
    before: State.create(),
    args: { text: "Connection failed: boom", error: true },
    after: { ...State.create(), bannerText: "Connection failed: boom", bannerError: true },
  },
];

describe("State.setBanner", () => {
  for (const { name, before, args, after } of cases) {
    it(name, () => {
      expectStateMatches(State.setBanner(before, args), after);
    });
  }
});
