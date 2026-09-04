// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { RpcMessage } from "./protocol.js";

/**
 * Runtime-agnostic, bidirectional message channel carrying {@link RpcMessage}s.
 *
 * Mirrors the `@adobe/data-sync` `SyncTransport` shape (send / onMessage /
 * onClose / close). RPC is symmetric, so `Send` and `Receive` default to the
 * same `RpcMessage` union. Implementations are provided for a `MessagePort`
 * (the primary iframe/worker transport), a `Window` (the initial port handoff),
 * and an in-process loopback pair (tests / demos).
 *
 * The transport does not own serialization — callers pass structured objects and
 * the underlying channel structured-clones them. Ordering of `send` calls is
 * preserved and delivery is assumed reliable.
 */
export interface RpcTransport<Send = RpcMessage, Receive = RpcMessage> {
    /**
     * Send a message to the remote end. `transfer` optionally lists
     * `Transferable`s handed off zero-copy (e.g. an `ArrayBuffer`); transports
     * over channels without transfer semantics ignore it.
     */
    readonly send: (msg: Send, transfer?: readonly Transferable[]) => void;
    /** Register a listener for messages from the remote end. Returns an unsubscribe. */
    readonly onMessage: (listener: (msg: Receive) => void) => () => void;
    /**
     * Register a listener that fires once when the channel closes — local
     * `close()`, remote close, or drop. Returns an unsubscribe. Firing is
     * idempotent (at most once).
     */
    readonly onClose: (listener: () => void) => () => void;
    /** Tear down the channel. */
    readonly close: () => void;
}
