// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { SignalingService } from "./signaling-service.js";
import type { Handlers } from "./types.js";

/**
 * Published response schedule for the deterministic double. Unlike the real
 * service it performs no WebRTC I/O: `createHostInvite` always resolves
 * {@link fakeInviteCode}, `createJoinAnswer` always resolves {@link fakeAnswerCode},
 * and the connection-completion path (`onConnected`) never fires — the double
 * exercises the deterministic *code-exchange* orchestration, which is exactly the
 * part a unit test can assert on. Consumers' tests rely on these fixed codes to
 * compute their expected `after`; they are part of the contract, not a hidden
 * detail. (Full transport wiring is integration-tested against the live app.)
 */
export const fakeInviteCode = "fake-invite-code";
export const fakeAnswerCode = "fake-answer-code";

/**
 * Deterministic test double for {@link SignalingService}. The `handlers` are
 * accepted for signature parity with `create` but `onConnected` is intentionally
 * never invoked (see above). This is the implementation the negotiation
 * main-service tests inject so their assertions are predictable — see
 * `features/services/index.md`.
 */
export const createFake = (_handlers: Handlers): SignalingService => ({
  serviceName: "signaling",
  createHostInvite: () => Promise.resolve(fakeInviteCode),
  acceptHostAnswer: () => Promise.resolve(),
  createJoinAnswer: () => Promise.resolve(fakeAnswerCode),
  reset: () => {},
  dispose: () => {},
});
