// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Service } from "@adobe/data/service";
import { AsyncDataService } from "@adobe/data/service";
import type { Assert } from "@adobe/data/types";

/**
 * The outside-world peer-connection port: the serverless copy-paste WebRTC
 * handshake. Its public surface is intentionally Data-only (codes in, codes
 * out) so it satisfies the async-data-service contract; the non-serializable
 * result of a completed handshake — the sync transport and a peer-link — is
 * delivered out-of-band to the `onConnected` handler supplied at construction
 * (see {@link SignalingService.Handlers}). No WebRTC / SDK type names leak into
 * this interface.
 *
 * Reached only through the negotiation `main-service` (its connection service
 * wires it to ecs state); never imported by the UI.
 */
export interface SignalingService extends Service {
  /** Host: create the invite code to share. Resolves once ICE gathering completes. */
  createHostInvite: () => Promise<string>;
  /** Host: submit the joiner's answer code, completing the handshake. */
  acceptHostAnswer: (answerCode: string) => Promise<void>;
  /** Joiner: consume the host's invite code and produce an answer code to send back. */
  createJoinAnswer: (inviteCode: string) => Promise<string>;
  /** Forget any in-flight host session so a fresh handshake can begin (reconnect). */
  reset: () => void;
  /** Tear down the live peer connection and its renegotiator. */
  dispose: () => void;
}

// Contract conforms to the async-data-service pattern (Data-only members).
type _Valid = Assert<AsyncDataService.IsValid<SignalingService>>;

export * as SignalingService from "./public.js";
