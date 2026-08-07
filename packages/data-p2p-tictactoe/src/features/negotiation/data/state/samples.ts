// © 2026 Adobe. MIT License. See /LICENSE for details.
import { create } from "./create.js";
import type { State } from "./state.js";

// Representative full negotiation states for the projection round-trip
// (toState ∘ fromState ≡ identity). Varied phase / role / connection / code /
// banner fields exercise the whole store↔State resource map.
export const samples: readonly State[] = [
  create(),
  {
    ...create(),
    phase: "host-signaling",
    role: "host",
    connection: "connecting",
    offerCode: "OFFER-123",
    hostAnswerInput: "partial",
    bannerText: "Waiting for a joiner…",
  },
  {
    ...create(),
    phase: "game",
    role: "joiner",
    connection: "connected",
    sessionId: "sess-9",
    answerCode: "ANSWER-9",
    bannerText: "Connection failed",
    bannerError: true,
  },
];
