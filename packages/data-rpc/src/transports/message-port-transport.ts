// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { RpcMessage } from "../protocol.js";
import type { RpcTransport } from "../transport.js";

/**
 * The primary iframe/worker transport: an {@link RpcTransport} over a
 * `MessagePort`. Assigning `onmessage` implicitly starts the port; we also call
 * `start()` explicitly so the transport is robust if the caller later switches
 * to `addEventListener`. Messages arriving before a listener registers are
 * buffered and flushed on the first `onMessage`, mirroring the loopback and
 * matching the fact that the port begins delivering as soon as it is wired.
 *
 * A `MessagePort` has no native "remote closed" event, so `onClose` fires only
 * on a local `close()`; a peer going away is surfaced instead via the
 * `unavailable` announcement (or a per-call timeout).
 */
export function createMessagePortTransport(port: MessagePort): RpcTransport {
    const listeners = new Set<(msg: RpcMessage) => void>();
    const closeListeners = new Set<() => void>();
    const pending: RpcMessage[] = [];
    let closed = false;

    port.onmessage = (event: MessageEvent) => {
        // Invariant: only RpcMessages are posted on a data-rpc port.
        const msg = event.data as RpcMessage;
        if (listeners.size === 0) {
            pending.push(msg);
            return;
        }
        for (const l of listeners) l(msg);
    };
    port.start();

    return {
        send(msg, transfer) {
            if (closed) return;
            port.postMessage(msg, transfer ? [...transfer] : []);
        },
        onMessage(listener) {
            listeners.add(listener);
            for (const msg of pending.splice(0)) listener(msg);
            return () => listeners.delete(listener);
        },
        onClose(listener) {
            if (closed) {
                listener();
                return () => undefined;
            }
            closeListeners.add(listener);
            return () => closeListeners.delete(listener);
        },
        close() {
            if (closed) return;
            closed = true;
            port.onmessage = null;
            port.close();
            for (const l of closeListeners) l();
            closeListeners.clear();
            listeners.clear();
        },
    };
}
