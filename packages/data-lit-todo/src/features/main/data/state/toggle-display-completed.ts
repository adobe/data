// © 2026 Adobe. MIT License. See /LICENSE for details.
import { AnalyticsService } from "../../services/analytics-service/analytics-service.js";
import type { Services } from "../../services/services.js";
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";

// Reads `displayCompleted`, writes `displayCompleted` — a `{ displayCompleted }`
// patch — flipping the flag; also logs `displayCompletedToggled`.
export const toggleDisplayCompleted = (
  state: Pick<State, "displayCompleted">,
  { analytics }: Pick<Services, "analytics">,
): Pick<State, "displayCompleted"> => {
  analytics.displayCompletedToggled();
  return { displayCompleted: !state.displayCompleted };
};

// Spec-owned cases, shared with the ecs `toggleDisplayCompleted` transaction.
// `before` is a delta over `State.create()`; `after` lists only the written
// `displayCompleted`. Only the flag flips; entities are untouched; the transition
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
      entities: new Map([[1, { name: "a", complete: true, order: 0 }]]),
      displayCompleted: true,
    },
    args: { analytics: AnalyticsService.createFake() },
    // Only `displayCompleted` is written; the carried-through entity is restated
    // with a plain spec-id; the round-trip compares up to an id-bijection.
    after: {
      entities: new Map([
        [1, { name: "a", complete: true, order: 0 }],
      ]),
      displayCompleted: false,
    },
    effects: { analytics: [["displayCompletedToggled"]] },
  },
];
