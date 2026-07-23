// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { State } from "./state.js";
import { cases } from "./step-ship.cases.js";
import { expectStateMatches } from "./expect-state-matches.js";

// The spec test runs the pure transform over the SHARED `{ before, args, after }`
// cases (the same array the ecs system conformance imports). Keeping the
// expectations here means "substitute the implementation, reuse the truth".
describe("State.stepShip", () => {
  for (const { name, before, args, after } of cases) {
    it(name, () => {
      expectStateMatches(State.stepShip(before, args.dt, args.input), after);
    });
  }
});
