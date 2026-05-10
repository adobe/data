// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Database } from "@adobe/data/ecs";
import type { ClientTransport, ServerMessage } from "./transport.js";

/**
 * Options for {@link createSyncService}.
 */
export interface SyncServiceOptions {
    /**
     * The database to wire into the sync layer. Must have been created with
     * `Database.create(plugin, { userId })` where `userId` is unique per peer
     * — the reconciler's transient queue uses `(userId, id)` as its compound
     * key to keep concurrent peers from colliding.
     */
    readonly database: Database<any, any, any, any>;
    /** Transport connecting this peer to the sync server. */
    readonly transport: ClientTransport;
    /**
     * Maximum `"transient"` messages forwarded per second. Intermediate
     * samples beyond this rate are silently dropped. Commits and cancels
     * are always forwarded immediately.
     *
     * Defaults to 20 (one per ~50 ms).
     */
    readonly maxTransientsPerSecond?: number;
}

/**
 * Background service returned by {@link createSyncService}. It owns no public
 * mutation surface — all mutations flow through `db.transactions.X(args)`.
 */
export interface SyncService {
    /** Stop forwarding, unsubscribe from the transport, and close it. */
    readonly dispose: () => void;
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
 * - Envelopes whose `TransactionResult.ephemeral === true` (i.e. they only
 *   touched ephemeral resources/entities) are skipped. UI-only state lives
 *   inside the same database without ever reaching the wire.
 * - `time > 0` → `kind: "propose"` (reliable).
 * - `time < 0` → `kind: "transient"` (rate-limited, lossy).
 * - `time === 0` → `kind: "cancel"` (reliable).
 *
 * @example
 * ```ts
 * const db = Database.create(myPlugin, { userId: crypto.randomUUID() });
 * const sync = createSyncService({ database: db, transport: ws });
 *
 * db.transactions.spawnUnit({ x: 0, y: 0, hp: 100 });
 *
 * sync.dispose();
 * ```
 */
export const createSyncService = (options: SyncServiceOptions): SyncService => {
    const { database, transport, maxTransientsPerSecond = 20 } = options;
    const minIntervalMs = 1000 / maxTransientsPerSecond;
    let lastTransientSentAt = 0;

    // Switch the database into deferred-commit mode so that local commits
    // apply as transients and wait for the server's echoed `committed`
    // envelope to promote them — this is what gives concurrent peers a
    // canonical entity-id assignment.
    database.setDeferredCommitMode(true);

    const unsubscribeOutbound = database.observe.envelopes(({ envelope, result, intent }) => {
        // Skip envelopes whose only effect was on ephemeral entities/
        // resources — those stay local-only by design.
        if (result?.ephemeral) return;

        if (intent === "commit") {
            transport.send({ kind: "propose", envelope });
        } else if (intent === "transient") {
            const now = Date.now();
            if (now - lastTransientSentAt < minIntervalMs) return;
            lastTransientSentAt = now;
            transport.send({ kind: "transient", envelope });
        } else {
            transport.send({ kind: "cancel", id: envelope.id });
        }
    });

    const unsubscribeInbound = transport.onMessage((msg: ServerMessage) => {
        if (msg.kind === "committed") {
            database.apply(msg.envelope);
        } else if (msg.kind === "cancelled") {
            database.cancel(msg.id);
        }
    });

    return {
        dispose: () => {
            unsubscribeOutbound();
            unsubscribeInbound();
            database.setDeferredCommitMode(false);
            transport.close();
        },
    };
};
