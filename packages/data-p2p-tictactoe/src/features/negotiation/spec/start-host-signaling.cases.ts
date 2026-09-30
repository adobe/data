// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { startHostSignaling } from "./start-host-signaling.js";

// Inert cases for `startHostSignaling`, run against the pure spec and the
// `startHostSignaling` action. A no-arg transition; `before` is a delta over
// `State.create()`, `after` the writes patch.
export const cases: Conformance.SpecCases<State, typeof startHostSignaling> = {
  cases: [
    {
      name: "enters host-signaling as host, connecting, with a waiting banner",
      before: {},
      after: {
        phase: "host-signaling",
        role: "host",
        connection: "connecting",
        bannerText: "Generating invite code — please wait…",
      },
    },
  ],
};
