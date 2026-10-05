// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { setBanner } from "./set-banner.js";

// Inert cases for `setBanner`, run against the pure spec and the `setBanner` action.
export const cases: Conformance.SpecCases<State, typeof setBanner> = {
  cases: [
    {
      name: "sets an informational banner",
      before: {},
      args: { text: "Generating answer — please wait…" },
      after: { bannerText: "Generating answer — please wait…" },
    },
    {
      name: "sets an error banner",
      before: {},
      args: { text: "Connection failed: boom", error: true },
      after: { bannerText: "Connection failed: boom", bannerError: true },
    },
  ],
};
