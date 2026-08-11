// © 2026 Adobe. MIT License. See /LICENSE for details.
import { AnalyticsService } from "../../services/analytics-service/analytics-service.js";
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";
import { Match } from "@adobe/data-testing";

// Reads `displayCompleted`, writes `displayCompleted` — a `{ displayCompleted }`
// patch — flipping the flag; also logs `displayCompletedToggled`.
export const toggleDisplayCompleted = (
  state: Pick<State, "displayCompleted">,
  { analytics }: { readonly analytics: AnalyticsService },
): Pick<State, "displayCompleted"> => {
  analytics.displayCompletedToggled();
  return { displayCompleted: !state.displayCompleted };
};

// Spec-owned cases, shared with the ecs `toggleDisplayCompleted` transaction.
// `before` is a delta over `State.create()`; `after` lists only the written
// `displayCompleted`. Only the flag flips; todos are untouched; the transition
// logs `displayCompletedToggled` (as the action does).
export const cases: Conformance<typeof toggleDisplayCompleted> = [
  {
    name: "turns the completed view on",
    before: {},
    args: { analytics: AnalyticsService.createFake() },
    after: { displayCompleted: true },
    effects: { analytics: [["displayCompletedToggled"]] },
  },
  {
    name: "turns the completed view off, leaving todos intact",
    before: {
      todos: [{ id: 1, name: "a", complete: true }],
      displayCompleted: true,
    },
    args: { analytics: AnalyticsService.createFake() },
    // Only `displayCompleted` is written, but the carried-through todo holds an
    // ecs-minted id, so it is restated with `Match.anyNumber` to bridge the
    // seeded data id (1) and the id the ecs assigns on the round-trip.
    after: {
      todos: [{ id: Match.anyNumber, name: "a", complete: true }],
      displayCompleted: false,
    },
    effects: { analytics: [["displayCompletedToggled"]] },
  },
];
