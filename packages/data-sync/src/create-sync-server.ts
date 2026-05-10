// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { TransactionEnvelope } from "@adobe/data/ecs";
import type { ServerTransport, ClientMessage } from "./transport.js";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SyncServerOptions {
    // Reserved for future options (e.g. max log size, auth hooks).
}

export interface SyncServer {
    /** Connect a new client transport to this server. */
    readonly connect: (transport: ServerTransport) => () => void;
    /** Dispose the server and disconnect all clients. */
    readonly dispose: () => void;
}

/**
 * Creates a sync server that accepts client proposals, assigns canonical
 * commit timestamps, and broadcasts committed envelopes to all connected
 * clients.
 *
 * The server is intentionally minimal:
 * - It does **not** maintain a database — it is a pure ordering service.
 * - Proposals are accepted in FIFO order (first-come-first-served).
 * - No authentication or validation is performed here; layer those on top via
 *   a middleware pattern (intercept `propose` messages before passing to
 *   `SyncServer`).
 *
 * @example
 * ```ts
 * const server = createSyncServer();
 * // When a WebSocket opens:
 * const disconnect = server.connect(webSocketServerTransport);
 * // When the WebSocket closes:
 * disconnect();
 * ```
 */
export const createSyncServer = (options: SyncServerOptions = {}): SyncServer => {
    const clients = new Set<ServerTransport>();
    const unsubscribers = new Map<ServerTransport, Array<() => void>>();

    // Ordered log of every committed envelope. Replayed to new clients on
    // connect so they can reconstruct the current committed state without a
    // separate snapshot mechanism.
    const committedLog: TransactionEnvelope[] = [];

    let nextTime = 1;

    const handleMessage = (origin: ServerTransport, msg: ClientMessage): void => {
        if (msg.kind === "propose") {
            const committed: TransactionEnvelope = {
                ...msg.envelope,
                time: nextTime++,
            };
            committedLog.push(committed);
            // Echo to ALL clients (including proposer, which promotes its transient).
            for (const c of clients) {
                c.send({ kind: "committed", envelope: committed });
            }
        } else if (msg.kind === "cancel") {
            for (const c of clients) {
                c.send({ kind: "cancelled", id: msg.id });
            }
        } else if (msg.kind === "transient") {
            // Speculative — relay to peers, never logged.
            for (const c of clients) {
                if (c !== origin) c.send({ kind: "committed", envelope: { ...msg.envelope } });
            }
        }
    };

    const connect = (transport: ServerTransport): (() => void) => {
        // Add to the live set BEFORE replaying history so that any commits
        // arriving from other clients during the replay are also forwarded.
        clients.add(transport);

        // Replay the full committed log so the new client reaches current state.
        // This must happen before subscribing to incoming messages to preserve
        // causal order: history first, then live updates.
        for (const envelope of committedLog) {
            transport.send({ kind: "committed", envelope });
        }

        const unsub = transport.onMessage(msg => handleMessage(transport, msg));
        unsubscribers.set(transport, [unsub]);

        return () => {
            for (const fn of unsubscribers.get(transport) ?? []) fn();
            unsubscribers.delete(transport);
            clients.delete(transport);
            transport.close();
        };
    };

    const dispose = () => {
        for (const transport of clients) {
            for (const fn of unsubscribers.get(transport) ?? []) fn();
            transport.close();
        }
        clients.clear();
        unsubscribers.clear();
    };

    return { connect, dispose };
};
