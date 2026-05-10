// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { ReconcilingDatabase, TransactionEnvelope } from "@adobe/data/ecs";
import type { ClientTransport, ServerMessage } from "./transport.js";

export interface SyncClientOptions {
    /**
     * The reconciling database this client will drive. The client observes
     * `db.observe.transactions` and forwards non-transient proposals to the
     * server; it also applies server-committed envelopes back to the database.
     */
    readonly database: ReconcilingDatabase<any, any, any, any>;
    /** Transport connecting this client to the sync server. */
    readonly transport: ClientTransport;
}

export interface SyncClient {
    /**
     * Propose a transient envelope to the server for eventual commitment.
     * The envelope is applied to the local database immediately as a transient
     * (optimistic update). The server will echo it back as committed, at which
     * point the reconciling database converts it to a permanent commit.
     */
    readonly propose: (envelope: TransactionEnvelope) => void;
    /**
     * Send a transient (speculative) envelope to other peers without requesting
     * commitment. Use for high-frequency, lossy signals like cursor positions.
     */
    readonly sendTransient: (envelope: TransactionEnvelope) => void;
    /** Cancel a previously proposed envelope by id. */
    readonly cancel: (id: number) => void;
    /** Disconnect from the server and stop applying incoming messages. */
    readonly dispose: () => void;
}

/**
 * Creates a sync client that bridges a `ReconcilingDatabase` and a
 * `ClientTransport`.
 *
 * Responsibility split:
 * - **Propose path**: caller calls `propose(envelope)` → client applies it
 *   transiently to the local DB and forwards to the server.
 * - **Commit path**: server echoes the envelope with a positive `time` →
 *   client calls `db.apply(committed)` which triggers rollback-replay in the
 *   reconciling DB.
 * - **Transient path**: `sendTransient` forwards speculative state; the client
 *   also receives and applies transient envelopes from other clients.
 * - **Cancel path**: calls `db.cancel(id)` and notifies the server.
 *
 * @example
 * ```ts
 * const client = createSyncClient({ database: myDb, transport });
 *
 * // Propose a commit:
 * client.propose({ id: nextId(), name: "spawnEntity", args: { x: 0, y: 0 }, time: -1 });
 *
 * // Broadcast cursor position (lossy):
 * client.sendTransient({ id: 99, name: "moveCursor", args: { x, y }, time: -1 });
 *
 * // Tear down:
 * client.dispose();
 * ```
 */
export const createSyncClient = (options: SyncClientOptions): SyncClient => {
    const { database, transport } = options;

    const handleServerMessage = (msg: ServerMessage): void => {
        if (msg.kind === "committed") {
            database.apply(msg.envelope);
        } else if (msg.kind === "cancelled") {
            database.cancel(msg.id);
        }
    };

    const unsubscribeTransport = transport.onMessage(handleServerMessage);

    const propose = (envelope: TransactionEnvelope): void => {
        database.apply({ ...envelope, time: Math.abs(envelope.time) * -1 });
        transport.send({ kind: "propose", envelope });
    };

    const sendTransient = (envelope: TransactionEnvelope): void => {
        database.apply({ ...envelope, time: -Math.abs(envelope.time) });
        transport.send({ kind: "transient", envelope });
    };

    const cancel = (id: number): void => {
        database.cancel(id);
        transport.send({ kind: "cancel", id });
    };

    const dispose = (): void => {
        unsubscribeTransport();
        transport.close();
    };

    return { propose, sendTransient, cancel, dispose };
};
