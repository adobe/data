// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Tests for the ping/pong keep-alive added to the sync protocol.
//
// SyncService periodically sends `ping`; SyncServer echoes `pong`. Either
// side closes the transport when the inbound stream goes quiet for longer
// than its `livenessTimeoutMs`. Closing fires the transport's `onClose`
// listeners, which higher layers wire to a reconnect flow.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Database, createRebaseReplayConcurrency } from "@adobe/data/ecs";
import type { ClientMessage, ServerMessage } from "./transport.js";
import { createLoopbackTransport } from "./loopback-transport.js";
import { createSyncServer } from "./create-sync-server.js";
import { createSyncService } from "./create-sync-service.js";

const plugin = Database.Plugin.create({
    components: {} as const,
    resources: {},
    archetypes: {} as const,
    transactions: {},
});

const makeDb = (userId: string) => Database.create(plugin, { concurrency: createRebaseReplayConcurrency(userId) });

describe("sync keep-alive (ping/pong)", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("client sends ping at the configured interval", () => {
        const { client, server } = createLoopbackTransport();
        const received: ClientMessage[] = [];
        server.onMessage((msg) => received.push(msg));

        const sync = createSyncService({
            database: makeDb("peer"),
            transport: client,
            pingIntervalMs: 1000,
            livenessTimeoutMs: 0,
        });

        // The first message is the hello handshake — ignore it.
        const before = received.length;

        vi.advanceTimersByTime(1000);
        expect(received.length).toBe(before + 1);
        expect(received[received.length - 1]).toEqual({ kind: "ping" });

        vi.advanceTimersByTime(2500);
        expect(received.filter((m) => m.kind === "ping").length).toBe(3);

        sync.dispose();
    });

    it("server replies to ping with pong", () => {
        const server = createSyncServer({ livenessTimeoutMs: 0 });
        const { client, server: serverTransport } = createLoopbackTransport();

        const inbound: ServerMessage[] = [];
        client.onMessage((msg) => inbound.push(msg));

        server.connect(serverTransport);
        client.send({ kind: "ping" });

        expect(inbound).toEqual([{ kind: "pong" }]);

        server.dispose();
    });

    it("client closes transport when no inbound traffic before liveness timeout", () => {
        const { client, server } = createLoopbackTransport();
        // Drain client outbound so loopback's pending-buffer doesn't grow
        // unboundedly, but never reply.
        server.onMessage(() => undefined);

        let closed = false;
        client.onClose(() => { closed = true; });

        createSyncService({
            database: makeDb("peer"),
            transport: client,
            pingIntervalMs: 1000,
            livenessTimeoutMs: 5000,
        });

        // No pong/welcome ever arrives. Just before the deadline we must
        // still be alive; just after, the transport must have closed itself.
        vi.advanceTimersByTime(4000);
        expect(closed).toBe(false);

        // Advance past the timeout plus a check tick (timeout/4 = 1250ms).
        vi.advanceTimersByTime(2500);
        expect(closed).toBe(true);
    });

    it("inbound traffic resets the liveness deadline", () => {
        const server = createSyncServer({ livenessTimeoutMs: 0 });
        const { client, server: serverTransport } = createLoopbackTransport();
        server.connect(serverTransport);

        let closed = false;
        client.onClose(() => { closed = true; });

        const sync = createSyncService({
            database: makeDb("peer"),
            transport: client,
            pingIntervalMs: 1000,
            livenessTimeoutMs: 5000,
        });

        // Pings keep flowing, server keeps ponging — the deadline resets each
        // tick, so well past the timeout we're still alive.
        vi.advanceTimersByTime(20_000);
        expect(closed).toBe(false);

        sync.dispose();
        server.dispose();
    });

    it("server closes a client transport when its inbound stream goes silent", () => {
        const server = createSyncServer({ livenessTimeoutMs: 5000 });
        const { client, server: serverTransport } = createLoopbackTransport();
        server.connect(serverTransport);

        let clientSawClose = false;
        client.onClose(() => { clientSawClose = true; });

        // We do NOT create a SyncService — no pings, no traffic at all.
        // The server-side liveness sweep should close us on its own.
        vi.advanceTimersByTime(4000);
        expect(clientSawClose).toBe(false);

        vi.advanceTimersByTime(2500);
        expect(clientSawClose).toBe(true);

        server.dispose();
    });

    it("pingIntervalMs: 0 disables ping sending entirely", () => {
        const { client, server } = createLoopbackTransport();
        const received: ClientMessage[] = [];
        server.onMessage((msg) => received.push(msg));

        const sync = createSyncService({
            database: makeDb("peer"),
            transport: client,
            pingIntervalMs: 0,
            livenessTimeoutMs: 0,
        });

        const beforePings = received.filter((m) => m.kind === "ping").length;
        vi.advanceTimersByTime(60_000);
        const afterPings = received.filter((m) => m.kind === "ping").length;
        expect(afterPings).toBe(beforePings);

        sync.dispose();
    });

    it("livenessTimeoutMs: 0 disables liveness checking on the client", () => {
        const { client, server } = createLoopbackTransport();
        server.onMessage(() => undefined);

        let closed = false;
        client.onClose(() => { closed = true; });

        const sync = createSyncService({
            database: makeDb("peer"),
            transport: client,
            pingIntervalMs: 1000,
            livenessTimeoutMs: 0,
        });

        vi.advanceTimersByTime(60_000);
        expect(closed).toBe(false);

        sync.dispose();
    });

    it("dispose stops the keep-alive timers", () => {
        const { client, server } = createLoopbackTransport();
        const received: ClientMessage[] = [];
        server.onMessage((msg) => received.push(msg));

        const sync = createSyncService({
            database: makeDb("peer"),
            transport: client,
            pingIntervalMs: 1000,
            livenessTimeoutMs: 5000,
        });

        vi.advanceTimersByTime(2500);
        const beforeDispose = received.filter((m) => m.kind === "ping").length;
        expect(beforeDispose).toBeGreaterThan(0);

        sync.dispose();

        vi.advanceTimersByTime(10_000);
        const afterDispose = received.filter((m) => m.kind === "ping").length;
        expect(afterDispose).toBe(beforeDispose);
    });
});
