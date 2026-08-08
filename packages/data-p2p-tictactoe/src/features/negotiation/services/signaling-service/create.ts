// © 2026 Adobe. MIT License. See /LICENSE for details.
import { startHostSignaling, startJoinerSignaling } from "./internal/signaling.js";
import { createRenegotiator } from "./internal/renegotiator.js";
import type { Role } from "../../data/role/role.js";
import type { SignalingService } from "./signaling-service.js";
import type { Handlers, PeerLink } from "./types.js";

const renegLog = (msg: string) => console.log(`[reneg] ${msg}`);

/**
 * Wrap a freshly negotiated peer connection as a {@link PeerLink}: create its
 * renegotiator and, on the host side, auto-trigger an ICE restart the moment the
 * path degrades to "disconnected" (a transient state where the signal channel
 * may still deliver renegotiation messages).
 */
const makeLink = (pc: RTCPeerConnection, signalChannel: RTCDataChannel, role: Role): PeerLink => {
  const renegotiator = createRenegotiator(pc, signalChannel, role, renegLog);
  const degradedCallbacks = new Set<() => void>();

  pc.addEventListener("connectionstatechange", () => {
    if (pc.connectionState === "disconnected") {
      for (const cb of degradedCallbacks) cb();
      if (role === "host") {
        renegotiator.triggerIceRestart().catch((err) => renegLog(`triggerIceRestart rejected: ${String(err)}`));
      }
    }
  });

  return {
    onDegraded: (callback) => { degradedCallbacks.add(callback); },
    restartIce: () => renegotiator.triggerIceRestart(),
    dispose: () => {
      renegotiator.dispose();
      degradedCallbacks.clear();
      pc.close();
    },
  };
};

/**
 * The production signaling service. Drives the real WebRTC copy-paste handshake
 * (see `./internal/`) and, on completion, hands the sync transport + peer-link to
 * `handlers.onConnected`.
 */
export const create = (handlers: Handlers): SignalingService => {
  let host: ReturnType<typeof startHostSignaling> | undefined;
  let currentLink: PeerLink | undefined;

  return {
    serviceName: "signaling",
    createHostInvite: () => {
      host = startHostSignaling();
      host.connected
        .then(({ transport, pc, signalChannel }) => {
          currentLink?.dispose();
          currentLink = makeLink(pc, signalChannel, "host");
          handlers.onConnected({ role: "host", transport, link: currentLink });
        })
        .catch(() => undefined);
      return host.offerCode;
    },
    acceptHostAnswer: async (answerCode: string) => {
      host?.submitAnswer(answerCode);
    },
    createJoinAnswer: (inviteCode: string) => {
      const session = startJoinerSignaling(inviteCode);
      session.connected
        .then(({ transport, pc, signalChannel }) => {
          currentLink?.dispose();
          currentLink = makeLink(pc, signalChannel, "joiner");
          handlers.onConnected({ role: "joiner", transport, link: currentLink });
        })
        .catch(() => undefined);
      return session.answerCode;
    },
    reset: () => {
      currentLink?.dispose();
      currentLink = undefined;
      host = undefined;
    },
    dispose: () => {
      currentLink?.dispose();
      currentLink = undefined;
      host = undefined;
    },
  };
};
