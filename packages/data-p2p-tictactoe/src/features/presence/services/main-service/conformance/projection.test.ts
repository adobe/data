// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Guards the presence projection: `toState(fromState(s)) ≡ s` over `State.samples`.
// Presence uses the lower-level runners (see conformance.md), so — unlike a
// `runFeature` feature, which folds this round-trip into the one call — its
// projection round-trip is a standalone test over the same shared samples.
import { describe, it } from "vitest";
import { Match } from "@adobe/data/testing";
import { State } from "../../../data/state/state.js";
import { createStore } from "./create-store.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

describe("presence conformance projection round-trips (toState ∘ fromState ≡ identity)", () => {
  State.samples.forEach((state, i) => {
    it(`sample ${i}`, () => {
      const store = createStore();
      fromState(store, state);
      Match.assert(toState(store), state);
    });
  });
});
