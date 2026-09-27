// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Services } from "../../services/services.js";
import type { State } from "./state.js";

// Reads `displayCompleted`, writes `displayCompleted` — a `{ displayCompleted }`
// patch — flipping the flag; also logs `displayCompletedToggled`.
export const toggleDisplayCompleted = (
  state: Pick<State, "displayCompleted">,
  { analytics }: Pick<Services, "analytics">,
): Pick<State, "displayCompleted"> => {
  analytics.displayCompletedToggled();
  return { displayCompleted: !state.displayCompleted };
};
