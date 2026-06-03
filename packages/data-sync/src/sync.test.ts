// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Soundness tests for the @adobe/data-sync protocol.
//
// Each test wires up a SyncServer + one or more SyncServices over loopback
// transports and verifies convergence / correctness properties. Application
// code only ever calls `db.transactions.X(args)` — the sync service forwards
// envelopes transparently.

import { describe, it, expect } from "vitest";
import { Database, createRebaseReplayConcurrency } from "@adobe/data/ecs";
import { createLoopbackTransport } from "./loopback-transport.js";
import { createSyncServer } from "./create-sync-server.js";
import { createSyncService } from "./create-sync-service.js";

// ---------------------------------------------------------------------------
// Shared test fixture
// ---------------------------------------------------------------------------

const plugin = Database.Plugin.create({
    components: {
        x: { type: "number", default: 0 },
        y: { type: "number", default: 0 },
        label: { type: "string" },
    } as const,
    resources: {
        // Synced resource — replicates to peers.
        score: { default: 0 as number },
        // Local-only resource — never replicates because of `ephemeral: true`.
        // (Verified by the "ephemeral resource never replicates" test below.)
        bannerText: { default: "" as string, ephemeral: true },
    },
    archetypes: {
        Point: ["x", "y", "label"],
    } as const,
    transactions: {
        createPoint(s, args: { x: number; y: number; label: string }) {
            return s.archetypes.Point.insert(args);
        },
        movePoint(s, args: { entity: number; x: number; y: number }) {
            s.update(args.entity, { x: args.x, y: args.y });
        },
        bumpScore(s, args: { delta: number }) {
            s.resources.score = s.resources.score + args.delta;
        },
        setBanner(s, args: { text: string }) {
            s.resources.bannerText = args.text;
        },
    },
});

const makeDb = (userId: string) => Database.create(plugin, { concurrency: createRebaseReplayConcurrency(userId) });

const snap = (db: ReturnType<typeof makeDb>) =>
    db.select(["x", "y", "label"])
        .map(e => ({ entity: e, ...db.read(e) }))
        .sort((a, b) => (a.label ?? "") < (b.label ?? "") ? -1 : 1);

// ---------------------------------------------------------------------------

describe("sync soundness", () => {
    // -----------------------------------------------------------------------
    // 1. Determinism: two clients receiving the same committed sequence converge
    // -----------------------------------------------------------------------

    it("two peers converge after one peer's transactions are forwarded via loopback", () => {
        const server = createSyncServer();

        const { client: c1t, server: s1t } = createLoopbackTransport();
        const { client: c2t, server: s2t } = createLoopbackTransport();

        const db1 = makeDb("peer1");
        const db2 = makeDb("peer2");

        server.connect(s1t);
        server.connect(s2t);

        const sync1 = createSyncService({ database: db1, transport: c1t });
        // peer 2 is a passive observer — sync service alone, no transactions
        createSyncService({ database: db2, transport: c2t });

        db1.transactions.createPoint({ x: 1, y: 2, label: "A" });
        db1.transactions.createPoint({ x: 3, y: 4, label: "B" });

        // Both DBs should have the same two points with the same entity ids.
        const snap1 = snap(db1);
        const snap2 = snap(db2);

        expect(snap1.length).toBe(2);
        expect(snap2.length).toBe(2);
        expect(snap1[0]!.entity).toBe(snap2[0]!.entity);
        expect(snap1[1]!.entity).toBe(snap2[1]!.entity);
        expect(snap1[0]!.label).toBe("A");
        expect(snap2[0]!.label).toBe("A");

        sync1.dispose();
        server.dispose();
    });

    // -----------------------------------------------------------------------
    // 2. Round-trip rebase: a local transaction is promoted from transient
    //    to committed and the database converges.
    // -----------------------------------------------------------------------

    it("a local transaction is promoted to committed and the database converges", () => {
        const server = createSyncServer();
        const { client: ct, server: st } = createLoopbackTransport();
        const db = makeDb("peer");

        server.connect(st);
        const sync = createSyncService({ database: db, transport: ct });

        db.transactions.createPoint({ x: 10, y: 20, label: "X" });

        const points = db.select(["label"]);
        expect(points.length).toBe(1);
        expect(db.read(points[0]!)?.label).toBe("X");

        sync.dispose();
        server.dispose();
    });

    // -----------------------------------------------------------------------
    // 3. Concurrent inserts from two clients converge to identical entity ids.
    // -----------------------------------------------------------------------

    it("concurrent inserts from two peers converge to identical entity ids", () => {
        const server = createSyncServer();
        const { client: c1t, server: s1t } = createLoopbackTransport();
        const { client: c2t, server: s2t } = createLoopbackTransport();

        const db1 = makeDb("peer1");
        const db2 = makeDb("peer2");

        server.connect(s1t);
        server.connect(s2t);

        const sync1 = createSyncService({ database: db1, transport: c1t });
        const sync2 = createSyncService({ database: db2, transport: c2t });

        db1.transactions.createPoint({ x: 1, y: 0, label: "Alpha" });
        db2.transactions.createPoint({ x: 2, y: 0, label: "Beta" });

        const entityByLabel = (db: ReturnType<typeof makeDb>, lbl: string) =>
            db.select(["label"]).find(e => db.read(e)?.label === lbl);

        expect(entityByLabel(db1, "Alpha")).toBe(entityByLabel(db2, "Alpha"));
        expect(entityByLabel(db1, "Beta")).toBe(entityByLabel(db2, "Beta"));

        sync1.dispose();
        sync2.dispose();
        server.dispose();
    });

    // -----------------------------------------------------------------------
    // 4. Late-join: a peer that connects after commits have already been
    //    made receives the full history and ends up in identical state.
    // -----------------------------------------------------------------------

    it("a late-joining peer receives full history and converges with existing peers", () => {
        const server = createSyncServer();

        const { client: c1t, server: s1t } = createLoopbackTransport();
        const db1 = makeDb("peer1");
        server.connect(s1t);
        const sync1 = createSyncService({ database: db1, transport: c1t });

        db1.transactions.createPoint({ x: 1, y: 2, label: "First" });
        db1.transactions.createPoint({ x: 3, y: 4, label: "Second" });

        // late peer joins AFTER both commits are already in the server log
        const { client: c2t, server: s2t } = createLoopbackTransport();
        const db2 = makeDb("peer2");
        server.connect(s2t);
        createSyncService({ database: db2, transport: c2t });

        const snap1 = snap(db1);
        const snap2 = snap(db2);

        expect(snap2.length).toBe(2);
        expect(snap2[0]!.entity).toBe(snap1[0]!.entity);
        expect(snap2[1]!.entity).toBe(snap1[1]!.entity);
        expect(snap2[0]!.label).toBe("First");
        expect(snap2[1]!.label).toBe("Second");

        sync1.dispose();
        server.dispose();
    });

    // -----------------------------------------------------------------------
    // 5. Ephemeral resource never replicates.
    //    Red-green: this is the semantic guarantee that ephemeral: true
    //    resources stay local. Sync service skips envelopes whose
    //    TransactionResult.ephemeral === true.
    // -----------------------------------------------------------------------

    it("ephemeral resource mutations are never replicated to peers", () => {
        const server = createSyncServer();
        const { client: c1t, server: s1t } = createLoopbackTransport();
        const { client: c2t, server: s2t } = createLoopbackTransport();

        const db1 = makeDb("peer1");
        const db2 = makeDb("peer2");

        server.connect(s1t);
        server.connect(s2t);

        const sync1 = createSyncService({ database: db1, transport: c1t });
        createSyncService({ database: db2, transport: c2t });

        db1.transactions.setBanner({ text: "private to peer1" });

        // Local DB sees the local change.
        expect(db1.resources.bannerText).toBe("private to peer1");
        // Peer 2 must NOT see it.
        expect(db2.resources.bannerText).toBe("");

        // Sanity check: a non-ephemeral mutation in the same session DOES replicate.
        db1.transactions.bumpScore({ delta: 5 });
        expect(db1.resources.score).toBe(5);
        expect(db2.resources.score).toBe(5);

        sync1.dispose();
        server.dispose();
    });

    // -----------------------------------------------------------------------
    // 6. (userId, id) compound key keeps two peers' independent local
    //    counters from colliding on the wire.
    // -----------------------------------------------------------------------

    it("two peers' identical local id counters do not collide via (userId, id) compound key", () => {
        const server = createSyncServer();
        const { client: c1t, server: s1t } = createLoopbackTransport();
        const { client: c2t, server: s2t } = createLoopbackTransport();

        const db1 = makeDb("peerA");
        const db2 = makeDb("peerB");

        server.connect(s1t);
        server.connect(s2t);

        const sync1 = createSyncService({ database: db1, transport: c1t });
        const sync2 = createSyncService({ database: db2, transport: c2t });

        // Both peers' local id counters start at 1; if compound keying were
        // broken these envelopes would overwrite each other in the
        // reconciler queue and one of the entities would be lost.
        db1.transactions.createPoint({ x: 0, y: 0, label: "FromA" });
        db2.transactions.createPoint({ x: 0, y: 0, label: "FromB" });

        const labels = (db: ReturnType<typeof makeDb>) =>
            db.select(["label"]).map(e => db.read(e)?.label).sort();

        expect(labels(db1)).toEqual(["FromA", "FromB"]);
        expect(labels(db2)).toEqual(["FromA", "FromB"]);

        sync1.dispose();
        sync2.dispose();
        server.dispose();
    });
});
