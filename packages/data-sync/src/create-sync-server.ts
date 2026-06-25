// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { TransactionEnvelope } from "@adobe/data/ecs";
import type { ServerTransport, ClientMessage } from "./transport.js";

export interface SyncServerOptions {
    /**
     * Maximum gap between inbound messages from a connected client before the
     * server closes that client's transport. Clients are expected to send a
     * `ping` at least once per interval to keep their entry alive. Pass `0`
     * to disable per-client liveness checking. Defaults to `25_000`.
     */
    readonly livenessTimeoutMs?: number;
    /**
     * Optional sink for human-readable lifecycle messages — connect, hello /
     * welcome handshake, propose / cancel, liveness drops, dispose. Pings
     * and pongs are intentionally not logged.
     */
    readonly logger?: (msg: string) => void;
}

export interface SyncServer {
    /**
     * Stable random identifier for this server instance's lifetime. Clients
     * send their prior session id in `hello`; a mismatch signals that the host
     * restarted and the client must reset and replay the full log.
     */
    readonly sessionId: string;
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
const generateId = (): string =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const createSyncServer = (options: SyncServerOptions = {}): SyncServer => {
    const { livenessTimeoutMs = 25_000, logger } = options;
    const log = logger ?? (() => undefined);
    const sessionId = generateId();
    log(`session ${sessionId} starting`);
    const clients = new Set<ServerTransport>();
    const unsubscribers = new Map<ServerTransport, Array<() => void>>();
    const lastInboundAt = new Map<ServerTransport, number>();

    // Ordered log of every committed envelope. Replayed to new clients on
    // connect so they can reconstruct the current committed state without a
    // separate snapshot mechanism.
    const committedLog: TransactionEnvelope[] = [];

    let nextTime = 1;

    const handleMessage = (origin: ServerTransport, msg: ClientMessage): void => {
        // Record liveness for any inbound message — pings are explicit, but a
        // chatty client that's actively sending proposals also counts as alive.
        lastInboundAt.set(origin, Date.now());
        if (msg.kind === "ping") {
            origin.send({ kind: "pong" });
            return;
        }
        if (msg.kind === "hello") {
            const clientSessionId = msg.sessionId;
            const lastAppliedTime = msg.lastAppliedTime;
            const maxServerTime = committedLog.length > 0 ? committedLog[committedLog.length - 1].time : 0;

            // A fresh client (no prior session id) always gets the full log with
            // resetRequired:false — its database is empty so no reset is needed.
            // A returning client with a mismatched session or a watermark ahead
            // of the server must reset and replay from scratch.
            const sessionMismatch = clientSessionId !== undefined && clientSessionId !== sessionId;
            const clientAhead = lastAppliedTime > maxServerTime;
            const resetRequired = sessionMismatch || clientAhead;

            const replayCount = committedLog.filter(e => e.time > (resetRequired ? 0 : lastAppliedTime)).length;
            log(`hello in (priorSession=${clientSessionId ?? "<fresh>"}, watermark=${lastAppliedTime}) → welcome (resetRequired=${resetRequired}, replaying=${replayCount})`);

            origin.send({ kind: "welcome", sessionId, resetRequired });

            // Replay the tail the client is missing (or the full log if reset needed).
            const fromTime = resetRequired ? 0 : lastAppliedTime;
            for (const envelope of committedLog) {
                if (envelope.time > fromTime) {
                    origin.send({ kind: "committed", envelope });
                }
            }
        } else if (msg.kind === "propose") {
            const committed: TransactionEnvelope = {
                ...msg.envelope,
                time: nextTime++,
            };
            committedLog.push(committed);
            log(`propose in (id=${msg.envelope.id}, name=${msg.envelope.name}) → committed at time=${committed.time}, broadcast to ${clients.size}`);
            // Echo to ALL clients (including proposer, which promotes its transient).
            for (const c of clients) {
                c.send({ kind: "committed", envelope: committed });
            }
        } else if (msg.kind === "cancel") {
            log(`cancel in (id=${msg.id}) → broadcast to ${clients.size}`);
            for (const c of clients) {
                c.send({ kind: "cancelled", id: msg.id });
            }
        } else if (msg.kind === "intermediate") {
            // Speculative intermediate — relay to peers, never logged.
            for (const c of clients) {
                if (c !== origin) c.send({ kind: "committed", envelope: { ...msg.envelope } });
            }
        }
    };

    const connect = (transport: ServerTransport): (() => void) => {
        // Add to the live set immediately so live commits during the replay
        // window are forwarded to this client too.
        clients.add(transport);
        lastInboundAt.set(transport, Date.now());
        log(`client connected (now ${clients.size} client${clients.size === 1 ? "" : "s"})`);

        // Do NOT replay history here — wait for the client's `hello` which
        // tells us what tail (if any) it already has.

        const unsub = transport.onMessage(msg => handleMessage(transport, msg));
        unsubscribers.set(transport, [unsub]);

        return () => {
            for (const fn of unsubscribers.get(transport) ?? []) fn();
            unsubscribers.delete(transport);
            clients.delete(transport);
            lastInboundAt.delete(transport);
            transport.close();
        };
    };

    // Per-client liveness sweep. We close transports that haven't sent any
    // inbound traffic for longer than livenessTimeoutMs; closing fires the
    // host-side onClose listeners so the negotiation layer can drive its
    // disconnect/reconnect flow.
    let livenessTimer: ReturnType<typeof setInterval> | undefined;
    if (livenessTimeoutMs > 0) {
        const checkInterval = Math.max(50, Math.floor(livenessTimeoutMs / 4));
        livenessTimer = setInterval(() => {
            const now = Date.now();
            for (const transport of clients) {
                const last = lastInboundAt.get(transport) ?? now;
                if (now - last > livenessTimeoutMs) {
                    log(`client liveness timeout — disconnecting (${now - last}ms silent)`);
                    // close() triggers our own onClose paths via the transport
                    // adapter, but we also clean the local maps eagerly.
                    clients.delete(transport);
                    lastInboundAt.delete(transport);
                    for (const fn of unsubscribers.get(transport) ?? []) fn();
                    unsubscribers.delete(transport);
                    transport.close();
                }
            }
        }, checkInterval);
    }

    const dispose = () => {
        log(`dispose (${clients.size} client${clients.size === 1 ? "" : "s"})`);
        if (livenessTimer !== undefined) {
            clearInterval(livenessTimer);
            livenessTimer = undefined;
        }
        for (const transport of clients) {
            for (const fn of unsubscribers.get(transport) ?? []) fn();
            transport.close();
        }
        clients.clear();
        unsubscribers.clear();
        lastInboundAt.clear();
    };

    return { sessionId, connect, dispose };
};
