// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { toggleDisplayCompleted } from "./toggle-display-completed.js";

// Inert cases for `toggleDisplayCompleted` (service-only args — no data `args`). Only
// the flag flips; entities are untouched; `displayCompletedToggled` is logged.
export const cases: Conformance.SpecCases<State, typeof toggleDisplayCompleted> = {
  cases: [
    {
      name: "turns the completed view on",
      before: {},
      after: { displayCompleted: true },
      effects: { analytics: [["displayCompletedToggled"]] },
    },
    {
      name: "turns the completed view off, leaving todos intact",
      before: {
        entities: new Map([[1, { name: "a", complete: true, order: 0 }]]),
        displayCompleted: true,
      },
      after: {
        entities: new Map([[1, { name: "a", complete: true, order: 0 }]]),
        displayCompleted: false,
      },
      effects: { analytics: [["displayCompletedToggled"]] },
    },
  ],
};
