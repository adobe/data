// © 2026 Adobe. MIT License. See /LICENSE for details.

export type {
    SyncTransport,
    ClientTransport,
    ServerTransport,
    ServerMessage,
    ClientMessage,
} from "./transport.js";

export { createLoopbackTransport } from "./loopback-transport.js";

export type { SyncServer, SyncServerOptions } from "./create-sync-server.js";
export { createSyncServer } from "./create-sync-server.js";

export type { SyncClient, SyncClientOptions } from "./create-sync-client.js";
export { createSyncClient } from "./create-sync-client.js";

export type {
    WebSocketClientTransportOptions,
    WebSocketLike,
} from "./websocket-transport.js";
export {
    createWebSocketClientTransport,
    createWebSocketServerTransport,
} from "./websocket-transport.js";

export type { LossyTransientTransportOptions } from "./lossy-transient-transport.js";
export { createLossyTransientTransport } from "./lossy-transient-transport.js";
