// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Guards the projection itself. `fromState` and `toState` are the bridge every
// transaction/action conformance test trusts; a symmetric bug in the pair (e.g.
// both dropping the same field) would cancel out and mask a real ecs defect. This
// identity test — `toState(fromState(s)) ≡ s` over representative states — proves
// the projection round-trips faithfully on its own. The state is entirely scalar
// resources (no ecs-minted ids), so the compare is exact.
import { describe, it } from "vitest";
import { Match } from "@adobe/data/testing";
import type { State } from "../../../data/state/state.js";
import { createStore } from "./create-store.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

const states: readonly { readonly name: string; readonly state: State }[] = [
  {
    name: "a populated dashboard: positive count, multi-entry log, named user",
    state: {
      count: 3,
      log: ["Incremented to 1", "Name changed to Ada"],
      userName: "Ada",
    },
  },
  {
    name: "the initial defaults: zero count, empty log, guest user",
    state: { count: 0, log: [], userName: "Guest" },
  },
];

describe("ecs conformance projection round-trips (toState ∘ fromState ≡ identity)", () => {
  for (const { name, state } of states) {
    it(name, () => {
      const store = createStore();
      fromState(store, state);
      Match.assert(toState(store), state);
    });
  }
});
