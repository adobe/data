// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Tests for the hello/welcome reconnect protocol.
//
// Scenarios:
//   1. Fresh client — welcome with resetRequired:false + full replay.
//   2. Reconnect with matching session + watermark — tail-only replay.
//   3. Reconnect client ahead of server — resetRequired:true + full replay.
//   4. Reconnect with mismatched session id — resetRequired:true + full replay.
//   5. End-to-end: disconnect, reconnect, verify only new envelopes arrive.
//   6. End-to-end: new server (session mismatch) → reset + full replay.

import { describe, it, expect, vi } from "vitest";
import { Database, createRebaseReplayConcurrency } from "@adobe/data/ecs";
import { createLoopbackTransport } from "./loopback-transport.js";
import { createSyncServer } from "./create-sync-server.js";
import { createSyncService } from "./create-sync-service.js";

// ---------------------------------------------------------------------------
// Shared plugin
// ---------------------------------------------------------------------------

const plugin = Database.Plugin.create({
    components: {
        x: { type: "number", default: 0 },
        label: { type: "string" },
    } as const,
    resources: {
        score: { default: 0 as number },
    },
    archetypes: { Point: ["x", "label"] } as const,
    transactions: {
        addPoint(s, args: { x: number; label: string }) {
            return s.archetypes.Point.insert(args);
        },
        bumpScore(s, args: { delta: number }) {
            s.resources.score = s.resources.score + args.delta;
        },
    },
});

const makeDb = (userId: string) => Database.create(plugin, { concurrency: createRebaseReplayConcurrency(userId) });
const entityCount = (db: ReturnType<typeof makeDb>) => db.select(["x", "label"]).length;
const labels = (db: ReturnType<typeof makeDb>) =>
    db.select(["label"]).map(e => db.read(e)?.label as string).sort();

// ---------------------------------------------------------------------------
// Hello / welcome protocol unit tests
// ---------------------------------------------------------------------------

describe("hello/welcome protocol", () => {
    it("fresh client receives welcome with resetRequired:false and full log replay", () => {
        const server = createSyncServer();

        // Pre-populate the server log via a seed client.
        const db0 = makeDb("seed");
        const { client: c0, server: s0 } = createLoopbackTransport();
        const d0 = server.connect(s0);
        const svc0 = createSyncService({ database: db0, transport: c0 });
        db0.transactions.addPoint({ x: 1, label: "a" });
        db0.transactions.addPoint({ x: 2, label: "b" });
        svc0.dispose(); d0();

        // Fresh client connects AFTER seed commits so it only gets the replay.
        const { client: ct, server: st } = createLoopbackTransport();
        const disconnect = server.connect(st);
        const db1 = makeDb("u1");
        const welcomeMsgs: Array<{ sessionId: string; resetRequired: boolean }> = [];
        const svc1 = createSyncService({
            database: db1,
            transport: ct,
            onWelcome: (msg) => welcomeMsgs.push(msg),
        });

        expect(welcomeMsgs).toHaveLength(1);
        expect(welcomeMsgs[0].resetRequired).toBe(false);
        expect(welcomeMsgs[0].sessionId).toBe(server.sessionId);
        expect(entityCount(db1)).toBe(2);

        svc1.dispose(); disconnect();
    });

    it("reconnecting client with matching session and watermark receives tail only", () => {
        const server = createSyncServer();

        // Initial connection — commit two transactions.
        const db1 = makeDb("u1");
        const { client: c1, server: s1 } = createLoopbackTransport();
        const d1 = server.connect(s1);
        const svc1 = createSyncService({ database: db1, transport: c1 });
        db1.transactions.addPoint({ x: 1, label: "first" });
        db1.transactions.addPoint({ x: 2, label: "second" });
        const watermarkAfterTwo = svc1.lastAppliedTime();
        const sessionId = svc1.sessionId()!;
        svc1.dispose(); d1();

        // Third commit from another peer while client is offline.
        const db2 = makeDb("u2");
        const { client: c2, server: s2 } = createLoopbackTransport();
        const d2 = server.connect(s2);
        const svc2 = createSyncService({ database: db2, transport: c2 });
        db2.transactions.addPoint({ x: 3, label: "third" });
        svc2.dispose(); d2();

        // Reconnect with watermark — spy on apply() to count replayed envelopes.
        const db1b = makeDb("u1");
        const applyArgs: unknown[] = [];
        const origApply = db1b.apply.bind(db1b);
        (db1b as any).apply = (env: any) => { applyArgs.push(env); return origApply(env); };

        const welcomeMsgs: Array<{ resetRequired: boolean }> = [];
        const { client: c1b, server: s1b } = createLoopbackTransport();
        const d1b = server.connect(s1b);
        const svc1b = createSyncService({
            database: db1b,
            transport: c1b,
            priorSessionId: sessionId,
            initialWatermark: watermarkAfterTwo,
            onWelcome: (msg) => welcomeMsgs.push(msg),
        });

        expect(welcomeMsgs[0].resetRequired).toBe(false);
        // Only the third envelope (time > watermarkAfterTwo) should have been applied.
        expect(applyArgs).toHaveLength(1);
        expect((applyArgs[0] as any).time).toBeGreaterThan(watermarkAfterTwo);

        svc1b.dispose(); d1b();
    });

    it("reconnecting client with time ahead of server triggers resetRequired:true + full replay", () => {
        const server = createSyncServer();
        const { client: ct, server: st } = createLoopbackTransport();
        const disconnect = server.connect(st);

        const db = makeDb("u1");
        const welcomeMsgs: Array<{ resetRequired: boolean }> = [];
        const svc = createSyncService({
            database: db,
            transport: ct,
            priorSessionId: server.sessionId,
            initialWatermark: 9999,
            onWelcome: (msg) => welcomeMsgs.push(msg),
        });

        expect(welcomeMsgs[0].resetRequired).toBe(true);
        svc.dispose(); disconnect();
    });

    it("reconnecting client with mismatched session triggers resetRequired:true + full replay", () => {
        const server = createSyncServer();

        // Pre-populate server.
        const db0 = makeDb("seed");
        const { client: c0, server: s0 } = createLoopbackTransport();
        const d0 = server.connect(s0);
        const svc0 = createSyncService({ database: db0, transport: c0 });
        db0.transactions.addPoint({ x: 1, label: "x" });
        svc0.dispose(); d0();

        const { client: ct, server: st } = createLoopbackTransport();
        const disconnect = server.connect(st);
        const db = makeDb("u1");
        const welcomeMsgs: Array<{ resetRequired: boolean }> = [];
        const svc = createSyncService({
            database: db,
            transport: ct,
            priorSessionId: "wrong-session-id",
            initialWatermark: 0,
            onWelcome: (msg) => welcomeMsgs.push(msg),
        });

        expect(welcomeMsgs[0].resetRequired).toBe(true);
        expect(entityCount(db)).toBe(1);  // full replay applied

        svc.dispose(); disconnect();
    });
});

// ---------------------------------------------------------------------------
// End-to-end reconnect scenarios
// ---------------------------------------------------------------------------

describe("end-to-end reconnect", () => {
    it("tail-only replay: only new transactions applied after reconnect", () => {
        const server = createSyncServer();

        // --- Initial session ---
        const db = makeDb("u1");
        const { client: c1, server: s1 } = createLoopbackTransport();
        const d1 = server.connect(s1);
        const svc1 = createSyncService({ database: db, transport: c1 });
        db.transactions.addPoint({ x: 1, label: "pre-disconnect-1" });
        db.transactions.addPoint({ x: 2, label: "pre-disconnect-2" });
        const watermark = svc1.lastAppliedTime();
        const session = svc1.sessionId()!;
        svc1.dispose(); d1();

        // --- New commit from a second peer while offline ---
        const db2 = makeDb("u2");
        const { client: c2, server: s2 } = createLoopbackTransport();
        const d2 = server.connect(s2);
        const svc2 = createSyncService({ database: db2, transport: c2 });
        db2.transactions.addPoint({ x: 3, label: "while-offline" });
        svc2.dispose(); d2();

        // --- Reconnect: spy on apply() ---
        const applyTimes: number[] = [];
        const origApply = db.apply.bind(db);
        (db as any).apply = (env: any) => { applyTimes.push(env.time); return origApply(env); };

        const { client: c1b, server: s1b } = createLoopbackTransport();
        const d1b = server.connect(s1b);
        const svc1b = createSyncService({ database: db, transport: c1b, priorSessionId: session, initialWatermark: watermark });

        // Only the one new commit should have been replayed.
        expect(applyTimes).toHaveLength(1);
        expect(applyTimes[0]).toBeGreaterThan(watermark);
        expect(entityCount(db)).toBe(3); // 2 before + 1 after

        svc1b.dispose(); d1b();
    });

    it("session mismatch: onWelcome with resetRequired:true, db.reset() clears stale state, full replay applied", () => {
        // --- Old server (first session) ---
        const oldServer = createSyncServer();
        const db = makeDb("u1");
        const { client: c1, server: s1 } = createLoopbackTransport();
        const d1 = oldServer.connect(s1);
        const svc1 = createSyncService({ database: db, transport: c1 });
        db.transactions.addPoint({ x: 1, label: "old-session" });
        const watermark = svc1.lastAppliedTime();
        const oldSession = svc1.sessionId()!;
        svc1.dispose(); d1();
        oldServer.dispose();

        // --- New server (new session, fresh log) ---
        const newServer = createSyncServer();
        expect(newServer.sessionId).not.toBe(oldSession);

        // Pre-populate new server with different data.
        const dbSeed = makeDb("seed");
        const { client: cs, server: ss } = createLoopbackTransport();
        const ds = newServer.connect(ss);
        const svcs = createSyncService({ database: dbSeed, transport: cs });
        dbSeed.transactions.addPoint({ x: 9, label: "new-session" });
        svcs.dispose(); ds();

        // --- Reconnect with old session credentials ---
        const resetCalled = vi.fn();
        const { client: c1b, server: s1b } = createLoopbackTransport();
        const d1b = newServer.connect(s1b);
        const svc1b = createSyncService({
            database: db,
            transport: c1b,
            priorSessionId: oldSession,
            initialWatermark: watermark,
            onWelcome: ({ resetRequired }) => {
                if (resetRequired) { db.reset(); resetCalled(); }
            },
        });

        expect(resetCalled).toHaveBeenCalledTimes(1);
        // After reset + full replay, db reflects new session's state only.
        expect(entityCount(db)).toBe(1);
        expect(labels(db)).toContain("new-session");
        expect(labels(db)).not.toContain("old-session");

        svc1b.dispose(); d1b();
    });
});
