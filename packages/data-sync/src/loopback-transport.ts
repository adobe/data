// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { ClientTransport, ServerTransport } from "./transport.js";

type Listener<T> = (msg: T) => void;

/**
 * Creates a paired in-process loopback transport.
 *
 * Messages sent on `client` are delivered synchronously to `server` listeners,
 * and vice-versa. Useful for unit tests and single-process demos that need the
 * full sync protocol without network I/O.
 *
 * @example
 * ```ts
 * const { client, server } = createLoopbackTransport();
 * const syncServer = createSyncServer();
 * syncServer.connect(server);
 * const sync = createSyncService({ database: db, transport: client });
 * ```
 */
export const createLoopbackTransport = (): {
    client: ClientTransport;
    server: ServerTransport;
} => {
    const clientListeners = new Set<Listener<import("./transport.js").ServerMessage>>();
    const serverListeners = new Set<Listener<import("./transport.js").ClientMessage>>();

    // Messages sent to a side before any listener is registered are buffered
    // and delivered on the first `onMessage` call. This mirrors real async
    // transports (WebSocket, MessagePort) where the sender cannot observe
    // whether the receiver has set up its handler yet.
    const clientPending: import("./transport.js").ServerMessage[] = [];
    const serverPending: import("./transport.js").ClientMessage[] = [];

    let closed = false;
    const closeListeners = new Set<() => void>();

    const fireClose = () => {
        if (!closed) return;
        for (const l of closeListeners) l();
        closeListeners.clear();
    };

    const client: ClientTransport = {
        send(msg) {
            if (closed) return;
            if (serverListeners.size === 0) {
                serverPending.push(msg);
            } else {
                for (const l of serverListeners) l(msg);
            }
        },
        onMessage(listener) {
            clientListeners.add(listener);
            // Flush buffered messages delivered before this listener registered.
            for (const msg of clientPending.splice(0)) listener(msg);
            return () => clientListeners.delete(listener);
        },
        onClose(listener) {
            if (closed) { listener(); return () => undefined; }
            closeListeners.add(listener);
            return () => closeListeners.delete(listener);
        },
        close() {
            if (closed) return;
            closed = true;
            clientListeners.clear();
            serverListeners.clear();
            fireClose();
        },
    };

    const server: ServerTransport = {
        send(msg) {
            if (closed) return;
            if (clientListeners.size === 0) {
                clientPending.push(msg);
            } else {
                for (const l of clientListeners) l(msg);
            }
        },
        onMessage(listener) {
            serverListeners.add(listener);
            for (const msg of serverPending.splice(0)) listener(msg);
            return () => serverListeners.delete(listener);
        },
        onClose(listener) {
            return client.onClose(listener);
        },
        close() {
            client.close();
        },
    };

    return { client, server };
};
