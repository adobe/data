// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { SignalingService } from "./signaling-service.js";

/**
 * Shape-only recording template for {@link SignalingService} — a TEST-TIER double,
 * NOT re-exported through `public.ts`, so it can never be reached as
 * `SignalingService.createFake` from runtime code. Every method is present: `void`
 * methods are inert, and the value-returning code-exchange methods hand back fixed
 * placeholder codes (it performs no WebRTC I/O and never fires `onConnected`). It
 * takes no handlers/response parameters. Imported directly by the negotiation
 * main-service tests (and the connection-service unit test) and nowhere else.
 */
export const createFake = (): SignalingService => ({
  serviceName: "signaling",
  createHostInvite: () => Promise.resolve("fake-invite-code"),
  acceptHostAnswer: () => Promise.resolve(),
  createJoinAnswer: () => Promise.resolve("fake-answer-code"),
  reset: () => {},
  dispose: () => {},
});
