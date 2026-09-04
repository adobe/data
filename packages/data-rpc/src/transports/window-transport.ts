// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { RpcMessage } from "../protocol.js";
import type { RpcTransport } from "../transport.js";

/** Options for {@link createWindowTransport}. */
export interface WindowTransportOptions {
    /** Origins accepted on inbound `message` events; all others are dropped (v1 trust boundary). */
    readonly allowedOrigins: readonly string[];
    /**
     * `targetOrigin` for outbound `postMessage`. Defaults to the sole
     * `allowedOrigins` entry when there is exactly one, otherwise `"*"`.
     * Specify explicitly whenever posting sensitive payloads.
     */
    readonly targetOrigin?: string;
}

/**
 * An {@link RpcTransport} over `window.postMessage`, primarily for the initial
 * `MessagePort` handoff between a page and its iframe (after which both sides
 * switch to {@link createMessagePortTransport}). Inbound events are dropped
 * unless their `origin` is allowlisted and the payload looks like an
 * {@link RpcMessage}. Listens on the current global `window`; sends to `target`.
 */
export function createWindowTransport(target: Window, options: WindowTransportOptions): RpcTransport {
    const listeners = new Set<(msg: RpcMessage) => void>();
    const closeListeners = new Set<() => void>();
    const pending: RpcMessage[] = [];
    let closed = false;

    // Never default outbound to "*" — that would post (possibly sensitive) replies
    // to whatever origin currently occupies the target frame. Require an explicit
    // targetOrigin unless there is exactly one allowed origin to infer it from.
    const targetOrigin = options.targetOrigin ?? (options.allowedOrigins.length === 1 ? options.allowedOrigins[0] : undefined);
    if (targetOrigin === undefined) {
        throw new Error("createWindowTransport: specify `targetOrigin` when `allowedOrigins` is not exactly one origin");
    }

    const handler = (event: MessageEvent) => {
        if (!options.allowedOrigins.includes(event.origin)) return; // untrusted origin
        const data: unknown = event.data;
        if (typeof data !== "object" || data === null || typeof (data as { kind?: unknown }).kind !== "string") {
            return; // not one of ours
        }
        const msg = data as RpcMessage;
        if (listeners.size === 0) {
            pending.push(msg);
            return;
        }
        for (const l of listeners) l(msg);
    };
    window.addEventListener("message", handler);

    return {
        send(msg, transfer) {
            if (closed) return;
            target.postMessage(msg, targetOrigin, transfer ? [...transfer] : []);
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
            window.removeEventListener("message", handler);
            for (const l of closeListeners) l();
            closeListeners.clear();
            listeners.clear();
        },
    };
}
