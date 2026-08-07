// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Guards the presence projection: `toState(fromState(s)) ≡ s` over representative
// states.
import { describe, it } from "vitest";
import type { Vec2 } from "@adobe/data/math";
import { Match } from "@adobe/data/testing";
import { State } from "../../../data/state/state.js";
import { createStore } from "./create-store.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

const at = (x: number, y: number): Vec2 => [x, y] as Vec2;

const states: readonly { readonly name: string; readonly state: State }[] = [
  { name: "no cursors reported yet", state: State.create() },
  { name: "one peer cursor", state: { cursors: { X: at(0.5, 0.25) } } },
  {
    name: "both peer cursors",
    state: { cursors: { X: at(0.5, 0.25), O: at(0.75, 0.5) } },
  },
];

describe("presence conformance projection round-trips (toState ∘ fromState ≡ identity)", () => {
  for (const { name, state } of states) {
    it(name, () => {
      const store = createStore();
      fromState(store, state);
      Match.assert(toState(store), state);
    });
  }
});
