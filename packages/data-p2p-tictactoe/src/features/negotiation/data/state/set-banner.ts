// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";

/** Set the banner text and whether it should be styled as an error. */
export const setBanner = <T extends State>(
  state: T,
  { text, error = false }: { text: string; error?: boolean },
): T => ({ ...state, bannerText: text, bannerError: error });

// Spec-owned cases, shared with the ecs `setBanner` transaction and action.
export const cases: Conformance<typeof setBanner> = [
  {
    name: "sets an informational banner",
    before: {
      phase: "idle", connection: "idle", role: null, sessionId: null,
      offerCode: "", answerCode: "", bannerText: "", bannerError: false,
      hostAnswerInput: "", joinerOfferInput: "",
    },
    args: { text: "Generating answer — please wait…" },
    after: {
      phase: "idle", connection: "idle", role: null, sessionId: null,
      offerCode: "", answerCode: "", bannerText: "Generating answer — please wait…",
      bannerError: false, hostAnswerInput: "", joinerOfferInput: "",
    },
  },
  {
    name: "sets an error banner",
    before: {
      phase: "idle", connection: "idle", role: null, sessionId: null,
      offerCode: "", answerCode: "", bannerText: "", bannerError: false,
      hostAnswerInput: "", joinerOfferInput: "",
    },
    args: { text: "Connection failed: boom", error: true },
    after: {
      phase: "idle", connection: "idle", role: null, sessionId: null,
      offerCode: "", answerCode: "", bannerText: "Connection failed: boom",
      bannerError: true, hostAnswerInput: "", joinerOfferInput: "",
    },
  },
];
