// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServerTransport, ClientTransport } from "@adobe/data-sync";

/**
 * A live peer link surfaced when a handshake completes: a clean wrapper over the
 * underlying peer connection and its ICE-restart renegotiator. Hides all WebRTC
 * types from the contract.
 */
export type PeerLink = {
  /** Register a callback fired when the path degrades (connection may recover). */
  readonly onDegraded: (callback: () => void) => void;
  /** Host-only: force an ICE restart to recover a degraded path. No-op on the joiner. */
  readonly restartIce: () => Promise<void>;
  /** Dispose the renegotiator and close the underlying connection. */
  readonly dispose: () => void;
};

/**
 * The result of a completed handshake, delivered to {@link Handlers.onConnected}.
 * Discriminated on `role` so the transport narrows to the correct sync direction
 * (host → `ServerTransport`, joiner → `ClientTransport`) with no cast.
 */
export type Connection =
  | { readonly role: "host"; readonly transport: ServerTransport; readonly link: PeerLink }
  | { readonly role: "joiner"; readonly transport: ClientTransport; readonly link: PeerLink };

/** Construction-time handlers. Non-serializable, so delivered here, not via a member. */
export type Handlers = {
  readonly onConnected: (connection: Connection) => void;
};
