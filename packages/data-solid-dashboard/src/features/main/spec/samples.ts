// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// Representative full states for the projection round-trip (toState ∘ fromState ≡
// identity). A populated dashboard and the initial defaults exercise the whole
// ecs↔State map. The state is entirely scalar resources, so the compare is exact.
export const samples: readonly State[] = [
  {
    count: 3,
    log: ["Incremented to 1", "Name changed to Ada"],
    userName: "Ada",
  },
  { count: 0, log: [], userName: "Guest" },
];
