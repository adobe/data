// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { SignalingService } from "./signaling-service.js";

/**
 * Fake {@link SignalingService}: no WebRTC I/O, never fires `onConnected`. The
 * code-exchange methods resolve fixed placeholder codes; `void` methods are inert.
 */
export const createFake = (): SignalingService => ({
  serviceName: "signaling",
  createHostInvite: () => Promise.resolve("fake-invite-code"),
  acceptHostAnswer: () => Promise.resolve(),
  createJoinAnswer: () => Promise.resolve("fake-answer-code"),
  reset: () => {},
  dispose: () => {},
});
