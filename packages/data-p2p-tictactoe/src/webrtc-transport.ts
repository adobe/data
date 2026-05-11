// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// WebRTC DataChannel adapters for @adobe/data-sync transports.
//
// RTCDataChannel is a reliable, ordered byte channel — the same delivery
// guarantee as WebSocket — making it a correct substrate for both the
// committed-envelope stream and the transient signal stream.

import type { ClientTransport, ServerTransport, ClientMessage, ServerMessage } from "@adobe/data-sync";

const encode = (msg: unknown): string => JSON.stringify(msg);
const decode = <T>(raw: string): T => JSON.parse(raw) as T;

/**
 * Two adapters wrap an open RTCDataChannel as a sync transport:
 *
 *   - `createWebRTCServerTransport` — used by the **host**, which runs
 *     `createSyncServer` in-process and wraps each connected peer's
 *     channel as a `ServerTransport`.
 *   - `createWebRTCClientTransport` — used by the **joiner**, which wraps
 *     its channel as a `ClientTransport` and passes it to
 *     `createSyncService({ database, transport })`.
 */

/**
 * Creates a ClientTransport backed by an RTCDataChannel.
 * Use on the joining peer (the "client" in sync terms).
 */
export const createWebRTCClientTransport = (channel: RTCDataChannel): ClientTransport => {
    const listeners = new Set<(msg: ServerMessage) => void>();
    const closeListeners = new Set<() => void>();
    let closed = false;

    const fireClose = () => {
        if (closed) return;
        closed = true;
        for (const l of closeListeners) l();
        closeListeners.clear();
    };

    channel.addEventListener("message", (e: MessageEvent<string>) => {
        const msg = decode<ServerMessage>(e.data);
        for (const l of listeners) l(msg);
    });
    channel.addEventListener("close", fireClose);

    return {
        send(msg: ClientMessage) {
            if (channel.readyState === "open") {
                channel.send(encode(msg));
            }
        },
        onMessage(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        onClose(listener) {
            if (closed) { listener(); return () => undefined; }
            closeListeners.add(listener);
            return () => closeListeners.delete(listener);
        },
        close() {
            fireClose();
            listeners.clear();
            if (channel.readyState === "open" || channel.readyState === "connecting") {
                channel.close();
            }
        },
    };
};

/**
 * Creates a ServerTransport backed by an RTCDataChannel.
 * Use on the hosting peer (the "server" in sync terms) — one per connected client.
 */
export const createWebRTCServerTransport = (channel: RTCDataChannel): ServerTransport => {
    const listeners = new Set<(msg: ClientMessage) => void>();
    const closeListeners = new Set<() => void>();
    let closed = false;

    const fireClose = () => {
        if (closed) return;
        closed = true;
        for (const l of closeListeners) l();
        closeListeners.clear();
    };

    channel.addEventListener("message", (e: MessageEvent<string>) => {
        const msg = decode<ClientMessage>(e.data);
        for (const l of listeners) l(msg);
    });
    channel.addEventListener("close", fireClose);

    return {
        send(msg: ServerMessage) {
            if (channel.readyState === "open") {
                channel.send(encode(msg));
            }
        },
        onMessage(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        onClose(listener) {
            if (closed) { listener(); return () => undefined; }
            closeListeners.add(listener);
            return () => closeListeners.delete(listener);
        },
        close() {
            fireClose();
            listeners.clear();
            if (channel.readyState === "open" || channel.readyState === "connecting") {
                channel.close();
            }
        },
    };
};

// ---------------------------------------------------------------------------
// ICE-complete offer/answer helpers
//
// We wait for ICE gathering to finish before returning the SDP, so the
// complete set of candidates is embedded in a single string blob. This
// avoids needing a real-time signaling channel for candidate trickling —
// the entire session description fits in one copy-paste exchange.
// ---------------------------------------------------------------------------

export const waitForIceComplete = (pc: RTCPeerConnection): Promise<void> =>
    new Promise((resolve) => {
        if (pc.iceGatheringState === "complete") { resolve(); return; }
        const handler = () => {
            if (pc.iceGatheringState === "complete") {
                pc.removeEventListener("icegatheringstatechange", handler);
                resolve();
            }
        };
        pc.addEventListener("icegatheringstatechange", handler);
    });

/** Encode an RTCSessionDescription as a compact base64 string for copy-paste. */
export const encodeSession = (sdp: RTCSessionDescriptionInit): string =>
    btoa(JSON.stringify(sdp));

/** Decode a base64 session string back to RTCSessionDescriptionInit. */
export const decodeSession = (encoded: string): RTCSessionDescriptionInit =>
    JSON.parse(atob(encoded)) as RTCSessionDescriptionInit;
