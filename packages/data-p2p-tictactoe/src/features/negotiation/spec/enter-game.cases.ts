// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { enterGame } from "./enter-game.js";

// Inert cases for `enterGame`, run against the pure spec and the `enterGame` action. A
// no-arg transition.
export const cases: Conformance.SpecCases<State, typeof enterGame> = {
  cases: [
    {
      name: "moves to the game phase, connected",
      before: { phase: "host-signaling", connection: "connecting", role: "host" },
      after: { phase: "game", connection: "connected" },
    },
  ],
};
