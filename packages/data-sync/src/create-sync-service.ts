// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Database } from "@adobe/data/ecs";
import type { ClientTransport, ServerMessage } from "./transport.js";

/**
 * Options for {@link createSyncService}.
 */
export interface SyncServiceOptions {
    /**
     * The database to wire into the sync layer. Must have been created with
     * `createRebaseReplayConcurrency(userId)` as its concurrency strategy,
     * where `userId` is unique per peer — the reconciler's transient queue
     * uses `(userId, id)` as its compound key to keep concurrent peers from
     * colliding, and the deferred-commit semantics are required for cross-peer
     * entity-id determinism.
     */
    readonly database: Database<any, any, any, any>;
    /** Transport connecting this peer to the sync server. */
    readonly transport: ClientTransport;
    /**
     * Maximum `"intermediate"` messages forwarded per second. Intermediate
     * samples beyond this rate are silently dropped. Commits and cancels
     * are always forwarded immediately.
     *
     * Defaults to 20 (one per ~50 ms).
     */
    readonly maxIntermediatesPerSecond?: number;
    /**
     * Session id received from a previous connection's `welcome` message.
     * Omit (or pass `undefined`) for a fresh client. If the server echoes back
     * the same id in `welcome`, it replays only the tail; otherwise it signals
     * a full reset and replay.
     */
    readonly priorSessionId?: string;
    /**
     * Highest committed `time` already applied to `database` from a previous
     * connection. The server uses this as the replay start point when the
     * session matches. Defaults to `0` (full replay).
     */
    readonly initialWatermark?: number;
    /**
     * Called once when the server's `welcome` message arrives, before any
     * replay envelopes are applied. Use this to call `database.reset()` when
     * `resetRequired` is true. Because it runs before the replay buffer is
     * flushed, it is safe to reset the database inside this callback.
     */
    readonly onWelcome?: (msg: { sessionId: string; resetRequired: boolean }) => void;
    /**
     * Interval between outbound `ping` keep-alives, in milliseconds. Pings
     * keep intermediate NAT mappings warm and let the peer detect a silent
     * drop faster than the underlying transport's own heartbeat. Pass `0` to
     * disable ping sending (the service will still observe inbound traffic
     * for liveness if `livenessTimeoutMs > 0`). Defaults to `10_000`.
     */
    readonly pingIntervalMs?: number;
    /**
     * Maximum gap between inbound messages before the transport is considered
     * dead. When exceeded the service calls `transport.close()`, which fires
     * the transport's `onClose` listeners — application code typically wires
     * those to a reconnect flow. Pass `0` to disable liveness checking.
     * Defaults to `25_000`.
     */
    readonly livenessTimeoutMs?: number;
    /**
     * Optional sink for human-readable lifecycle messages — handshake,
     * commits, cancels, liveness events, dispose. Pings/pongs are
     * intentionally not logged (too noisy). The library itself never imports
     * `console`, so consumers that want visibility wire one up explicitly:
     *
     *     logger: (m) => console.log(`[sync] ${m}`)
     */
    readonly logger?: (msg: string) => void;
}

/**
 * Background service returned by {@link createSyncService}. It owns no public
 * mutation surface — all mutations flow through `db.transactions.X(args)`.
 */
export interface SyncService {
    /** Stop forwarding, unsubscribe from the transport, and close it. */
    readonly dispose: () => void;
    /** The highest committed `time` applied to the database so far. */
    readonly lastAppliedTime: () => number;
    /** The session id received from the server's `welcome` message, or `undefined` if not yet connected. */
    readonly sessionId: () => string | undefined;
}

/**
 * Wires a {@link Database} to a {@link ClientTransport} so that every
 * locally-initiated transaction is automatically replicated to peers, and
 * every server-broadcast envelope is automatically applied to the local DB.
 *
 * The service is a pure subscriber — application code only ever calls
 * `db.transactions.X(args)`. It mirrors the shape of
 * `createStoragePersistenceService`: side-effect lifecycle attached to a DB.
 *
 * Forwarding rules:
 * - `db.observe.envelopes` fires once per locally-initiated envelope (the
 *   wrapper notifies it after `applyEnvelope` returns). Replays inside the
 *   reconciler and inbound `db.apply()` calls do NOT fire it, so there is
 *   no bounce-back to filter.
 * - Envelopes whose `TransactionResult.persistent === false` (i.e. they only
 *   touched non-persistent resources/entities) are skipped. UI-only state lives
 *   inside the same database without ever reaching the wire.
 * - `time > 0` → `kind: "propose"` (reliable).
 * - `time < 0` → `kind: "intermediate"` (rate-limited, lossy).
 * - `time === 0` → `kind: "cancel"` (reliable).
 *
 * @example
 * ```ts
 * const db = Database.create(myPlugin, {
 *     concurrency: createRebaseReplayConcurrency(crypto.randomUUID()),
 * });
 * const sync = createSyncService({ database: db, transport: ws });
 *
 * db.transactions.spawnUnit({ x: 0, y: 0, hp: 100 });
 *
 * sync.dispose();
 * ```
 */
export const createSyncService = (options: SyncServiceOptions): SyncService => {
    const {
        database,
        transport,
        maxIntermediatesPerSecond = 20,
        priorSessionId,
        initialWatermark = 0,
        onWelcome,
        pingIntervalMs = 10_000,
        livenessTimeoutMs = 25_000,
        logger,
    } = options;
    const log = logger ?? (() => undefined);

    if (!database.concurrency.deferredCommit || database.concurrency.userId === undefined) {
        throw new Error(
            "createSyncService: database must use createRebaseReplayConcurrency(userId) as its concurrency strategy.",
        );
    }

    const minIntervalMs = 1000 / maxIntermediatesPerSecond;
    let lastIntermediateSentAt = 0;
    let lastAppliedTime = initialWatermark;
    let serverSessionId: string | undefined;
    let lastInboundAt = Date.now();
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    let livenessTimer: ReturnType<typeof setInterval> | undefined;

    const stopHeartbeat = () => {
        if (pingTimer !== undefined) {
            clearInterval(pingTimer);
            pingTimer = undefined;
        }
        if (livenessTimer !== undefined) {
            clearInterval(livenessTimer);
            livenessTimer = undefined;
        }
    };

    // Buffer inbound committed/cancelled envelopes that arrive before the
    // welcome handler runs. This lets onWelcome call database.reset()
    // synchronously before any replayed envelopes are applied.
    let bufferedInbound: ServerMessage[] | null = [];

    const flushBuffered = () => {
        if (bufferedInbound === null) return;
        const msgs = bufferedInbound;
        bufferedInbound = null;
        for (const msg of msgs) applyInbound(msg);
    };

    const applyInbound = (msg: ServerMessage) => {
        if (msg.kind === "committed") {
            log(`committed in (time=${msg.envelope.time}, name=${msg.envelope.name})`);
            database.apply(msg.envelope);
            if (msg.envelope.time > lastAppliedTime) {
                lastAppliedTime = msg.envelope.time;
            }
        } else if (msg.kind === "cancelled") {
            log(`cancelled in (id=${msg.id})`);
            database.cancel(msg.id);
        }
    };

    const unsubscribeInbound = transport.onMessage((msg: ServerMessage) => {
        // Any inbound traffic — committed envelope, welcome, pong, anything —
        // proves the peer is still alive. Refresh the liveness deadline first
        // so we don't trip over slow callbacks below.
        lastInboundAt = Date.now();
        if (msg.kind === "pong") return;
        if (msg.kind === "welcome") {
            log(`welcome in (sessionId=${msg.sessionId}, resetRequired=${msg.resetRequired})`);
            serverSessionId = msg.sessionId;
            // Invoke the welcome handler synchronously (it may call database.reset()).
            onWelcome?.({ sessionId: msg.sessionId, resetRequired: msg.resetRequired });
            // After the handler returns, flush buffered replay envelopes.
            flushBuffered();
        } else if (bufferedInbound !== null) {
            bufferedInbound.push(msg);
        } else {
            applyInbound(msg);
        }
    });

    const unsubscribeOutbound = database.observe.envelopes(({ envelope, result, intent }) => {
        // Skip envelopes whose only effect was on non-persistent entities/
        // resources — those stay local-only by design.
        if (result !== undefined && !result.persistent) return;

        if (intent === "commit") {
            log(`propose out (id=${envelope.id}, name=${envelope.name})`);
            transport.send({ kind: "propose", envelope });
        } else if (intent === "intermediate") {
            const now = Date.now();
            if (now - lastIntermediateSentAt < minIntervalMs) return;
            lastIntermediateSentAt = now;
            transport.send({ kind: "intermediate", envelope });
        } else {
            log(`cancel out (id=${envelope.id})`);
            transport.send({ kind: "cancel", id: envelope.id });
        }
    });

    // Send hello immediately — the onWelcome option is already registered, so
    // the welcome response can be processed synchronously even on loopback.
    log(`hello out (priorSessionId=${priorSessionId ?? "<fresh>"}, watermark=${initialWatermark})`);
    transport.send({ kind: "hello", sessionId: priorSessionId, lastAppliedTime: initialWatermark });

    // Keep-alive timers. The transport's own onClose listener clears them as
    // a safety net so a leaked service doesn't keep the event loop alive.
    if (pingIntervalMs > 0) {
        pingTimer = setInterval(() => {
            transport.send({ kind: "ping" });
        }, pingIntervalMs);
    }
    if (livenessTimeoutMs > 0) {
        // Check at a fraction of the timeout so we detect a drop within
        // ~timeout + checkInterval and tests can use small timeouts.
        const checkInterval = Math.max(50, Math.floor(livenessTimeoutMs / 4));
        livenessTimer = setInterval(() => {
            if (Date.now() - lastInboundAt > livenessTimeoutMs) {
                log(`liveness timeout — closing transport`);
                stopHeartbeat();
                transport.close();
            }
        }, checkInterval);
    }
    const unsubscribeClose = transport.onClose(() => {
        log(`transport closed`);
        stopHeartbeat();
    });

    return {
        dispose: () => {
            log(`dispose`);
            stopHeartbeat();
            unsubscribeClose();
            unsubscribeOutbound();
            unsubscribeInbound();
            transport.close();
        },
        lastAppliedTime: () => lastAppliedTime,
        sessionId: () => serverSessionId,
    };
};
