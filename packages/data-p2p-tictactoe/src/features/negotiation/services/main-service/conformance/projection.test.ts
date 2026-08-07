// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Guards the projection itself: `toState(fromState(s)) ≡ s` over representative
// states, so a symmetric bug in the pair can't mask a real ecs defect.
import { describe, it } from "vitest";
import { Match } from "@adobe/data/testing";
import { State } from "../../../data/state/state.js";
import { createStore } from "./create-store.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

const states: readonly { readonly name: string; readonly state: State }[] = [
  { name: "the initial idle state", state: State.create() },
  {
    name: "a host mid-signaling with an offer code",
    state: {
      ...State.create(),
      phase: "host-signaling",
      role: "host",
      connection: "connecting",
      offerCode: "OFFER-123",
      hostAnswerInput: "partial",
    },
  },
  {
    name: "a connected game session",
    state: {
      ...State.create(),
      phase: "game",
      role: "joiner",
      connection: "connected",
      sessionId: "sess-9",
      answerCode: "ANSWER-9",
    },
  },
];

describe("negotiation conformance projection round-trips (toState ∘ fromState ≡ identity)", () => {
  for (const { name, state } of states) {
    it(name, () => {
      const store = createStore();
      fromState(store, state);
      Match.assert(toState(store), state);
    });
  }
});
