// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { RpcMessage } from "../protocol.js";
import type { RpcTransport } from "../transport.js";

type Listener = (msg: RpcMessage) => void;

/**
 * One directed, buffered, asynchronous pipe. Delivery is scheduled on a
 * microtask (never synchronous with `send`) to model a real `MessagePort`,
 * where the first value of a subscription necessarily arrives after the
 * subscribe call returns. Messages sent before a listener registers are
 * buffered and flushed once one does. FIFO order is preserved.
 */
function createDirectedPipe() {
    const listeners = new Set<Listener>();
    const pending: RpcMessage[] = [];
    let flushScheduled = false;
    let closed = false;

    const drain = () => {
        flushScheduled = false;
        if (closed) return;
        while (pending.length > 0 && listeners.size > 0) {
            const msg = pending.shift()!;
            for (const l of listeners) l(msg);
        }
    };
    const schedule = () => {
        if (flushScheduled || closed) return;
        flushScheduled = true;
        queueMicrotask(drain);
    };

    return {
        push(msg: RpcMessage) {
            if (closed) return;
            pending.push(msg);
            schedule();
        },
        onMessage(listener: Listener) {
            listeners.add(listener);
            if (pending.length > 0) schedule();
            return () => listeners.delete(listener);
        },
        close() {
            closed = true;
            pending.length = 0;
            listeners.clear();
        },
    };
}

/**
 * A paired in-process loopback transport for tests and single-process demos.
 * Messages sent on `a` are delivered asynchronously to `b`'s listeners and
 * vice-versa. Each message is `structuredClone`d on `send`, exactly as a
 * `MessagePort` would — so a non-cloneable payload throws here too, and no
 * live references leak across the (simulated) boundary. Closing either side
 * tears down the whole channel and fires every `onClose` listener once.
 */
export function createRpcLoopbackTransport(): { a: RpcTransport; b: RpcTransport } {
    const aToB = createDirectedPipe(); // a.send → b.onMessage
    const bToA = createDirectedPipe(); // b.send → a.onMessage

    let closed = false;
    const closeA = new Set<() => void>();
    const closeB = new Set<() => void>();

    const doClose = () => {
        if (closed) return;
        closed = true;
        aToB.close();
        bToA.close();
        for (const l of closeA) l();
        for (const l of closeB) l();
        closeA.clear();
        closeB.clear();
    };

    const makeSide = (
        out: ReturnType<typeof createDirectedPipe>,
        inbound: ReturnType<typeof createDirectedPipe>,
        closeListeners: Set<() => void>,
    ): RpcTransport => ({
        send(msg) {
            if (closed) return;
            // Clone on send to model the structured-clone boundary of a real port.
            out.push(structuredClone(msg));
        },
        onMessage(listener) {
            return inbound.onMessage(listener);
        },
        onClose(listener) {
            if (closed) { listener(); return () => undefined; }
            closeListeners.add(listener);
            return () => closeListeners.delete(listener);
        },
        close: doClose,
    });

    return {
        a: makeSide(aToB, bToA, closeA),
        b: makeSide(bToA, aToB, closeB),
    };
}
