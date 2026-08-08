// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { SignalingService } from "./signaling-service.js";
import type { Handlers } from "./types.js";

/**
 * Deterministic test double for {@link SignalingService}. Unlike the real
 * service it performs no WebRTC I/O: `createHostInvite` always resolves
 * `"fake-invite-code"`, `createJoinAnswer` always resolves `"fake-answer-code"`,
 * and the connection-completion path (`onConnected`) never fires — the double
 * exercises the deterministic *code-exchange* orchestration, which is exactly the
 * part a unit test can assert on. A test asserts those fixed codes as literals it
 * controls. The `handlers` are accepted for signature parity with `create` but
 * `onConnected` is intentionally never invoked. (Full transport wiring is
 * integration-tested against the live app.) This is the implementation the
 * negotiation main-service tests inject so their assertions are predictable —
 * see `features/services/index.md`.
 */
export const createFake = (_handlers: Handlers): SignalingService => ({
  serviceName: "signaling",
  createHostInvite: () => Promise.resolve("fake-invite-code"),
  acceptHostAnswer: () => Promise.resolve(),
  createJoinAnswer: () => Promise.resolve("fake-answer-code"),
  reset: () => {},
  dispose: () => {},
});
