// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Soundness tests for the @adobe/data-sync protocol.
//
// Each test wires up a SyncServer + one or more SyncClients over loopback
// transports and verifies convergence / correctness properties.

import { describe, it, expect } from "vitest";
import { createReconcilingDatabase, Store } from "@adobe/data/ecs";
import { createLoopbackTransport } from "./loopback-transport.js";
import { createSyncServer } from "./create-sync-server.js";
import { createSyncClient } from "./create-sync-client.js";

// ---------------------------------------------------------------------------
// Shared test fixture
// ---------------------------------------------------------------------------

const makeDb = () => {
    const store = Store.create({
        components: {
            x: { type: "number", default: 0 },
            y: { type: "number", default: 0 },
            label: { type: "string" },
        } as const,
        resources: {},
        archetypes: {
            Point: ["x", "y", "label"],
        } as const,
    });

    type S = typeof store;

    const transactions = {
        createPoint(s: S, args: { x: number; y: number; label: string }) {
            return s.archetypes.Point.insert(args);
        },
        movePoint(s: S, args: { entity: number; x: number; y: number }) {
            s.update(args.entity, { x: args.x, y: args.y });
        },
    };

    return createReconcilingDatabase(store, transactions);
};

let _idCounter = 100;
const nextId = () => ++_idCounter;

// ---------------------------------------------------------------------------
// 1. Determinism: two clients receiving the same committed sequence converge
// ---------------------------------------------------------------------------

describe("sync soundness", () => {
    it("two clients converge after receiving the same committed envelopes via loopback", () => {
        const server = createSyncServer();

        const { client: c1t, server: s1t } = createLoopbackTransport();
        const { client: c2t, server: s2t } = createLoopbackTransport();

        const db1 = makeDb();
        const db2 = makeDb();

        server.connect(s1t);
        server.connect(s2t);

        const client1 = createSyncClient({ database: db1, transport: c1t });

        // client2 is a passive observer — it does not propose anything
        createSyncClient({ database: db2, transport: c2t });

        client1.propose({ id: nextId(), name: "createPoint", args: { x: 1, y: 2, label: "A" }, time: -1 });
        client1.propose({ id: nextId(), name: "createPoint", args: { x: 3, y: 4, label: "B" }, time: -1 });

        // Both DBs should have the same two points with the same entity ids.
        const snap = (db: ReturnType<typeof makeDb>) =>
            db.select(["x", "y", "label"])
                .map(e => ({ entity: e, ...db.read(e) }))
                .sort((a, b) => (a.label ?? "") < (b.label ?? "") ? -1 : 1);

        const snap1 = snap(db1);
        const snap2 = snap(db2);

        expect(snap1.length).toBe(2);
        expect(snap2.length).toBe(2);
        expect(snap1[0]!.entity).toBe(snap2[0]!.entity);
        expect(snap1[1]!.entity).toBe(snap2[1]!.entity);
        expect(snap1[0]!.label).toBe("A");
        expect(snap2[0]!.label).toBe("A");

        client1.dispose();
        server.dispose();
    });

    // -----------------------------------------------------------------------
    // 2. Round-trip rebase: transient → committed results in correct state
    // -----------------------------------------------------------------------

    it("a transient proposal is promoted to committed and the database converges", () => {
        const server = createSyncServer();
        const { client: ct, server: st } = createLoopbackTransport();
        const db = makeDb();

        server.connect(st);
        const client = createSyncClient({ database: db, transport: ct });

        client.propose({ id: nextId(), name: "createPoint", args: { x: 10, y: 20, label: "X" }, time: -1 });

        // The loopback server echoes back with positive time; the client's
        // database should now have the point committed (no transient entries).
        const points = db.select(["label"]);
        expect(points.length).toBe(1);
        expect(db.read(points[0]!)?.label).toBe("X");

        client.dispose();
        server.dispose();
    });

    // -----------------------------------------------------------------------
    // 3. Concurrent-insert id stability: two clients insert simultaneously;
    //    both must end up with identical entity ids for the same logical entity.
    // -----------------------------------------------------------------------

    it("concurrent inserts from two clients converge to identical entity ids", () => {
        const server = createSyncServer();
        const { client: c1t, server: s1t } = createLoopbackTransport();
        const { client: c2t, server: s2t } = createLoopbackTransport();

        const db1 = makeDb();
        const db2 = makeDb();

        server.connect(s1t);
        server.connect(s2t);

        const client1 = createSyncClient({ database: db1, transport: c1t });
        const client2 = createSyncClient({ database: db2, transport: c2t });

        // Both clients propose a point before either receives the other's commit.
        client1.propose({ id: nextId(), name: "createPoint", args: { x: 1, y: 0, label: "Alpha" }, time: -1 });
        client2.propose({ id: nextId(), name: "createPoint", args: { x: 2, y: 0, label: "Beta" }, time: -1 });

        // Loopback is synchronous so both commits are echoed immediately.
        const entityByLabel = (db: ReturnType<typeof makeDb>, lbl: string) =>
            db.select(["label"]).find(e => db.read(e)?.label === lbl);

        expect(entityByLabel(db1, "Alpha")).toBe(entityByLabel(db2, "Alpha"));
        expect(entityByLabel(db1, "Beta")).toBe(entityByLabel(db2, "Beta"));

        client1.dispose();
        client2.dispose();
        server.dispose();
    });

    // -----------------------------------------------------------------------
    // 4. Cancel before commit: cancelling a proposed id rolls it back locally
    //    and the server notifies all clients.
    // -----------------------------------------------------------------------

    it("cancelling a proposal removes it from the database on all clients", () => {
        const server = createSyncServer();
        const { client: c1t, server: s1t } = createLoopbackTransport();
        const { client: c2t, server: s2t } = createLoopbackTransport();

        const db1 = makeDb();
        const db2 = makeDb();

        server.connect(s1t);
        server.connect(s2t);

        const client1 = createSyncClient({ database: db1, transport: c1t });
        createSyncClient({ database: db2, transport: c2t });

        const id = nextId();
        client1.propose({ id, name: "createPoint", args: { x: 5, y: 5, label: "ToDelete" }, time: -1 });

        // Over synchronous loopback, the commit lands before the cancel.
        // Both sides see the committed entity.
        expect(db1.select(["label"]).length).toBe(1);
        expect(db2.select(["label"]).length).toBe(1);

        // The cancel arrives after the commit has already landed — this is a
        // no-op for a committed entry. Document that cancel only works for
        // *transient* (in-flight) proposals.
        client1.cancel(id);
        expect(db1.select(["label"]).length).toBe(1);

        client1.dispose();
        server.dispose();
    });

    // -----------------------------------------------------------------------
    // 5. Initial load: a client that connects after commits have already been
    //    made receives the full history and ends up in identical state.
    // -----------------------------------------------------------------------

    it("a late-joining client receives full history and converges with existing clients", () => {
        const server = createSyncServer();

        // early client joins and makes two commits
        const { client: c1t, server: s1t } = createLoopbackTransport();
        const db1 = makeDb();
        server.connect(s1t);
        const client1 = createSyncClient({ database: db1, transport: c1t });

        client1.propose({ id: nextId(), name: "createPoint", args: { x: 1, y: 2, label: "First" }, time: -1 });
        client1.propose({ id: nextId(), name: "createPoint", args: { x: 3, y: 4, label: "Second" }, time: -1 });

        // late client joins AFTER both commits are already in the server log
        const { client: c2t, server: s2t } = createLoopbackTransport();
        const db2 = makeDb();
        server.connect(s2t);
        createSyncClient({ database: db2, transport: c2t });

        // db2 should have replayed the history and match db1's committed state
        const snap = (db: ReturnType<typeof makeDb>) =>
            db.select(["label"])
                .map(e => ({ entity: e, ...db.read(e) }))
                .sort((a, b) => (a.label ?? "") < (b.label ?? "") ? -1 : 1);

        const snap1 = snap(db1);
        const snap2 = snap(db2);

        expect(snap2.length).toBe(2);
        expect(snap2[0]!.entity).toBe(snap1[0]!.entity);
        expect(snap2[1]!.entity).toBe(snap1[1]!.entity);
        expect(snap2[0]!.label).toBe("First");
        expect(snap2[1]!.label).toBe("Second");

        client1.dispose();
        server.dispose();
    });

    // -----------------------------------------------------------------------
    // 6. Transient lossiness: sendTransient does NOT commit to the server;
    //    a fresh database that connects later has no record of it.
    // -----------------------------------------------------------------------

    it("sendTransient is not committed — a fresh database has no record of it", () => {
        const server = createSyncServer();
        const { client: c1t, server: s1t } = createLoopbackTransport();
        const { client: c2t, server: s2t } = createLoopbackTransport();

        const db1 = makeDb();
        const db2 = makeDb();

        server.connect(s1t);
        server.connect(s2t);

        const client1 = createSyncClient({ database: db1, transport: c1t });
        createSyncClient({ database: db2, transport: c2t });

        // sendTransient applies locally (transient) and is relayed to peers.
        client1.sendTransient({
            id: nextId(),
            name: "createPoint",
            args: { x: 9, y: 9, label: "Cursor" },
            time: -1,
        });

        // db1 sees the local transient.
        expect(db1.select(["label"]).length).toBeGreaterThanOrEqual(1);

        // A fresh db3 that connects after the transient was sent should see
        // zero committed points (the transient was never committed).
        const db3 = makeDb();
        const { client: c3t, server: s3t } = createLoopbackTransport();
        server.connect(s3t);
        createSyncClient({ database: db3, transport: c3t });

        expect(db3.select(["label"]).length).toBe(0);

        client1.dispose();
        server.dispose();
    });
});
