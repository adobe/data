// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { ClientTransport, ServerTransport, ClientMessage, ServerMessage } from "./transport.js";

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

const encode = (msg: unknown): string => JSON.stringify(msg);
const decode = <T>(raw: string): T => JSON.parse(raw) as T;

// ---------------------------------------------------------------------------
// Client-side WebSocket transport (browser and Node.js 22+)
// ---------------------------------------------------------------------------

/**
 * Options for {@link createWebSocketClientTransport}.
 */
export interface WebSocketClientTransportOptions {
    /**
     * WebSocket URL to connect to (e.g. `"ws://localhost:4000/sync"`).
     */
    readonly url: string;
    /**
     * Optional WebSocket constructor override for environments that do not have
     * a global `WebSocket` (Node.js < 22). Pass `require("ws")` or a polyfill.
     */
    readonly WebSocket?: typeof globalThis.WebSocket;
    /**
     * Called when the connection opens. Use to send an initial handshake if
     * needed (e.g. authentication token).
     */
    readonly onOpen?: (ws: globalThis.WebSocket) => void;
    /** Called when the connection closes (clean or error). */
    readonly onClose?: (event: CloseEvent) => void;
}

/**
 * Creates a {@link ClientTransport} backed by a WebSocket connection.
 *
 * The connection is established immediately. Messages sent before the socket
 * is open are buffered and flushed on connect. Closing the transport closes
 * the socket with code 1000 (normal closure).
 *
 * Works in browsers (native `WebSocket`) and in Node.js 22+ (global
 * `WebSocket`). For earlier Node.js, pass `options.WebSocket = require("ws")`.
 *
 * @example
 * ```ts
 * const transport = createWebSocketClientTransport({ url: "ws://localhost:4000/sync" });
 * const sync = createSyncService({ database: myDb, transport });
 * ```
 */
export const createWebSocketClientTransport = (
    options: WebSocketClientTransportOptions,
): ClientTransport => {
    const WS = options.WebSocket ?? globalThis.WebSocket;
    const ws = new WS(options.url);

    const listeners = new Set<(msg: ServerMessage) => void>();
    const pendingOutbound: string[] = [];

    ws.addEventListener("open", () => {
        options.onOpen?.(ws);
        for (const msg of pendingOutbound) ws.send(msg);
        pendingOutbound.length = 0;
    });

    ws.addEventListener("message", (event: MessageEvent) => {
        const msg = decode<ServerMessage>(event.data as string);
        for (const l of listeners) l(msg);
    });

    ws.addEventListener("close", (event: CloseEvent) => {
        options.onClose?.(event);
    });

    return {
        send(msg: ClientMessage) {
            const encoded = encode(msg);
            if (ws.readyState === ws.OPEN) {
                ws.send(encoded);
            } else {
                pendingOutbound.push(encoded);
            }
        },
        onMessage(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        close() {
            listeners.clear();
            if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
                ws.close(1000, "client disposed");
            }
        },
    };
};

// ---------------------------------------------------------------------------
// Server-side WebSocket transport adapter
//
// The server does not create WebSocket connections — it accepts them. This
// adapter wraps a single, already-established WebSocket instance (from any
// WebSocket server library) into a ServerTransport.
// ---------------------------------------------------------------------------

/**
 * Minimal interface for an already-open WebSocket connection on the server
 * side. Compatible with the browser `WebSocket` API and the `ws` npm package.
 */
export interface WebSocketLike {
    readonly readyState: number;
    send(data: string): void;
    addEventListener(event: "message", handler: (event: { data: string }) => void): void;
    addEventListener(event: "close", handler: () => void): void;
    removeEventListener(event: string, handler: (...args: any[]) => void): void;
    close(code?: number, reason?: string): void;
}

/**
 * Wraps an already-accepted `WebSocket` connection into a {@link ServerTransport}.
 *
 * Call this inside your WebSocket server's "connection" handler:
 *
 * ```ts
 * const server = createSyncServer();
 *
 * // With the `ws` package:
 * const wss = new WebSocketServer({ port: 4000 });
 * wss.on("connection", (ws) => {
 *   const transport = createWebSocketServerTransport(ws);
 *   const disconnect = server.connect(transport);
 *   ws.on("close", disconnect);
 * });
 * ```
 */
export const createWebSocketServerTransport = (ws: WebSocketLike): ServerTransport => {
    const listeners = new Set<(msg: ClientMessage) => void>();

    const messageHandler = (event: { data: string }) => {
        const msg = decode<ClientMessage>(event.data);
        for (const l of listeners) l(msg);
    };
    ws.addEventListener("message", messageHandler);

    return {
        send(msg: ServerMessage) {
            if (ws.readyState === 1 /* OPEN */) {
                ws.send(encode(msg));
            }
        },
        onMessage(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        close() {
            ws.removeEventListener("message", messageHandler);
            listeners.clear();
            if (ws.readyState === 1) {
                ws.close(1000, "server transport disposed");
            }
        },
    };
};
