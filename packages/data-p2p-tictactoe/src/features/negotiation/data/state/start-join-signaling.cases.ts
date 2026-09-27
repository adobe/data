// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { startJoinSignaling } from "./start-join-signaling.js";

// Inert, spec-owned cases for `startJoinSignaling`, shared with the ecs
// `startJoinSignaling` transaction and action. A no-arg transition; it clears any
// stale banner on entry.
export const cases: Conformance.SpecCases<State, typeof startJoinSignaling> = {
  cases: [
    {
      name: "enters join-signaling as joiner, connecting, clearing the banner",
      before: { bannerText: "stale", bannerError: true },
      after: {
        phase: "join-signaling",
        role: "joiner",
        connection: "connecting",
        bannerText: "",
        bannerError: false,
      },
    },
  ],
};
