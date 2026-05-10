// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { PersistenceBackend } from "../backend/persistence-backend.js";
import { createPersistRouter, type PersistRouter } from "./router.js";
import type { AckMessage, PersistMessage, PersistOp, Transport } from "./transport.js";

/**
 * In-process transport. Delegates directly to a {@link PersistRouter}
 * created from the given backend. Intended for:
 *
 *   - tests (no worker startup, no message-channel overhead)
 *   - Node servers that already absorb fs I/O on libuv and do not need
 *     a dedicated thread
 *
 * No `Transferable` semantics — the same ArrayBuffer reference is
 * shared with the router. Callers that wish to enforce
 * transfer-style hand-off should use the worker transports instead.
 */
export const createInprocessTransport = (
    backend: PersistenceBackend,
): Transport => {
    const router: PersistRouter = createPersistRouter(backend);
    const handlers = new Set<(msg: PersistMessage) => void>();
    // Track in-flight router operations so flush() can drain them
    // without a polling loop. Each op is added on dispatch and removed
    // on settle.
    const pending = new Set<Promise<unknown>>();
    let closed = false;

    const dispatchAck = (ack: AckMessage): void => {
        for (const h of handlers) h(ack);
    };

    const track = <T>(p: Promise<T>): Promise<T> => {
        pending.add(p);
        const remove = (): void => { pending.delete(p); };
        p.then(remove, remove);
        return p;
    };

    return {
        send(op: PersistOp): void {
            if (closed) throw new Error("Transport is closed");
            // Fire-and-forget; surface errors as ack messages.
            track(
                router.handle(op).then(
                    (value) => dispatchAck({ kind: "ack", id: op.id, value }),
                    (err: unknown) => dispatchAck({ kind: "ack", id: op.id, error: String(err instanceof Error ? err.message : err) }),
                ),
            );
        },
        async request<T = unknown>(op: PersistOp): Promise<T> {
            if (closed) throw new Error("Transport is closed");
            return track(router.handle(op)) as Promise<T>;
        },
        onMessage(handler) {
            handlers.add(handler);
            return () => handlers.delete(handler);
        },
        async flush(): Promise<void> {
            // Loop because settling a pending op may itself enqueue another
            // (e.g. an ack handler that triggers a follow-up write).
            while (pending.size > 0) {
                await Promise.allSettled([...pending]);
            }
        },
        async close(): Promise<void> {
            closed = true;
            await this.flush();
            handlers.clear();
            await router.close();
        },
    };
};
