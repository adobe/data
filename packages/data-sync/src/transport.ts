// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { TransactionEnvelope } from "@adobe/data/ecs";

/**
 * Messages flowing from server → client (broadcasts).
 *
 * - `committed`  — an envelope has been accepted by the server and assigned a
 *   canonical wall-clock `time`. Every client must apply this in the order it
 *   is received; the `time` values are monotonically increasing per session.
 * - `cancelled`  — an envelope the server received was rejected (e.g. auth
 *   failure, validation error). Clients that hold a matching transient should
 *   roll it back.
 * - `welcome`    — response to `hello`. Sent before any replay. When
 *   `resetRequired` is true the client must wipe its database before applying
 *   the full replay that follows; when false the server will replay only the
 *   tail since `lastAppliedTime`.
 * - `pong`       — keep-alive reply to a client `ping`. Carries no payload;
 *   its only purpose is to refresh the client's liveness deadline and keep
 *   intermediate NAT mappings warm.
 */
export type ServerMessage =
    | { readonly kind: "committed"; readonly envelope: TransactionEnvelope }
    | { readonly kind: "cancelled"; readonly id: number; readonly reason?: string }
    | { readonly kind: "welcome"; readonly sessionId: string; readonly resetRequired: boolean }
    | { readonly kind: "pong" };

/**
 * Messages flowing from client → server (proposals).
 *
 * - `propose`    — client wants to commit an operation. The envelope's `time`
 *   must be negative (transient) when sent; the server assigns the final time.
 * - `intermediate` — speculative state the client wants other clients to see
 *   (e.g. cursor position, dragging). Servers may broadcast these as-is or
 *   drop/throttle them; they are never persisted.
 * - `cancel`     — client withdraws a previously proposed envelope.
 * - `hello`      — sent exactly once per connection, immediately after wiring.
 *   Carries the client's prior `sessionId` (omit for a fresh client) and the
 *   highest committed `time` already applied locally. The server responds with
 *   `welcome` and replays only what the client is missing.
 * - `ping`       — keep-alive probe. The server replies with `pong` and uses
 *   the receipt to refresh its per-client liveness deadline. Pings carry no
 *   payload and are independent of the hello/welcome handshake.
 */
export type ClientMessage =
    | { readonly kind: "propose"; readonly envelope: TransactionEnvelope }
    | { readonly kind: "intermediate"; readonly envelope: TransactionEnvelope }
    | { readonly kind: "cancel"; readonly id: number }
    | { readonly kind: "hello"; readonly sessionId?: string; readonly lastAppliedTime: number }
    | { readonly kind: "ping" };

/**
 * Runtime-agnostic, bidirectional message channel.
 *
 * Implementations are provided for:
 *   - in-process loopback (testing / single-tab)
 *   - WebSocket (browser ↔ Node.js)
 *
 * The transport does not own serialization — callers pass structured objects.
 * Ordering of `send` calls is preserved; delivery is assumed reliable (use a
 * reliable transport like WebSocket, not UDP, for the committed stream).
 */
export interface SyncTransport<Send, Receive> {
    /** Send a message to the remote end. */
    readonly send: (msg: Send) => void;
    /** Register a listener that will receive messages from the remote end. */
    readonly onMessage: (listener: (msg: Receive) => void) => () => void;
    /**
     * Register a listener that fires once when the channel closes — whether
     * due to a remote close, network drop, or a local `close()` call.
     * Returns an unsubscribe function. Firing is idempotent (at most once).
     */
    readonly onClose: (listener: () => void) => () => void;
    /** Tear down the channel. */
    readonly close: () => void;
}

/** Transport from the client's perspective. */
export type ClientTransport = SyncTransport<ClientMessage, ServerMessage>;

/** Transport from the server's perspective (per connected client). */
export type ServerTransport = SyncTransport<ServerMessage, ClientMessage>;
