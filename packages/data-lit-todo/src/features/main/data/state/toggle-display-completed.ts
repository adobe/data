// © 2026 Adobe. MIT License. See /LICENSE for details.
import { AnalyticsService } from "../../services/analytics-service/analytics-service.js";
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";
import { Match } from "@adobe/data/testing";
export const toggleDisplayCompleted = <
  T extends Pick<State, "displayCompleted">,
>(
  state: T,
  { analytics }: { readonly analytics: AnalyticsService },
): T => {
  analytics.displayCompletedToggled();
  return { ...state, displayCompleted: !state.displayCompleted };
};

// Spec-owned cases, shared with the ecs `toggleDisplayCompleted` transaction.
// Only the `displayCompleted` flag flips; the transition logs
// `displayCompletedToggled` (as the action does).
export const cases: Conformance<typeof toggleDisplayCompleted> = [
  {
    name: "turns the completed view on",
    before: { todos: [], displayCompleted: false },
    args: { analytics: AnalyticsService.createFake() },
    after: { todos: [], displayCompleted: true },
    effects: { analytics: [["displayCompletedToggled"]] },
  },
  {
    name: "turns the completed view off, leaving todos intact",
    before: {
      todos: [{ id: 1, name: "a", complete: true }],
      displayCompleted: true,
    },
    args: { analytics: AnalyticsService.createFake() },
    after: {
      todos: [{ id: Match.anyNumber, name: "a", complete: true }],
      displayCompleted: false,
    },
    effects: { analytics: [["displayCompletedToggled"]] },
  },
];
