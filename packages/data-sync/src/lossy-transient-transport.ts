// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { ClientTransport, ClientMessage, ServerMessage } from "./transport.js";

/**
 * Options for {@link createLossyTransientTransport}.
 */
export interface LossyTransientTransportOptions {
    /**
     * The underlying reliable transport used for `"propose"` and `"cancel"`
     * messages (commits and cancellations must never be dropped).
     */
    readonly reliableTransport: ClientTransport;
    /**
     * Maximum number of `"transient"` messages sent per second.
     * Defaults to 20 (one per animation frame at 20 fps).
     */
    readonly maxTransientsPerSecond?: number;
}

/**
 * A {@link ClientTransport} adapter that sends `"propose"` and `"cancel"`
 * messages reliably through the underlying transport, while rate-limiting
 * (and dropping intermediate) `"transient"` messages.
 *
 * This is the recommended approach for high-frequency signals like cursor
 * positions, drag previews, or real-time drawing strokes — you want peers
 * to see *recent* state, not every intermediate sample.
 *
 * Incoming server messages are forwarded unchanged from the underlying
 * transport.
 *
 * @example
 * ```ts
 * const ws = createWebSocketClientTransport({ url: "ws://localhost:4000/sync" });
 * const transport = createLossyTransientTransport({ reliableTransport: ws });
 * const client = createSyncClient({ database: myDb, transport });
 * ```
 */
export const createLossyTransientTransport = (
    options: LossyTransientTransportOptions,
): ClientTransport => {
    const { reliableTransport, maxTransientsPerSecond = 20 } = options;
    const minIntervalMs = 1000 / maxTransientsPerSecond;

    let lastTransientSentAt = 0;

    return {
        send(msg: ClientMessage) {
            if (msg.kind !== "transient") {
                // Commits and cancellations are always forwarded immediately.
                reliableTransport.send(msg);
                return;
            }

            // For transient messages, only send if enough time has passed
            // since the last one. Intermediate samples are silently dropped.
            const now = Date.now();
            if (now - lastTransientSentAt >= minIntervalMs) {
                lastTransientSentAt = now;
                reliableTransport.send(msg);
            }
        },
        onMessage(listener: (msg: ServerMessage) => void) {
            return reliableTransport.onMessage(listener);
        },
        close() {
            reliableTransport.close();
        },
    };
};
