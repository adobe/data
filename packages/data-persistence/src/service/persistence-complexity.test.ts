// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Persistence complexity contract.
//
// The promise the design makes:
//
//   The cost of persisting a transaction T is O(changes), where
//   "changes" means the number of (entity, component) pairs that T
//   actually touched — plus a small constant per affected entity
//   (entity-location update, commit marker, etc).
//
// Crucially, it must NOT depend on:
//
//   - the total number of entities in the world
//   - the row capacity of the affected archetype
//   - the number of archetypes registered
//
// We assert this by counting the PersistOp messages emitted per
// transaction across worlds of widely varying size and confirming the
// op count is identical (and small).
//
// We assert OP COUNT, not wall time, because:
//
//   - wall time fluctuates with GC, JIT warmup, and OS scheduling
//   - op count is the closed-form algorithmic invariant — if op count
//     is flat, time-per-op is bounded by per-op work (which is itself
//     O(stride) per write, not O(world))

import { Database } from "@adobe/data/ecs";
import { F32, Vec3 } from "@adobe/data/math";
import { describe, expect, it } from "vitest";
import { createMemoryBackend } from "../backend/memory-backend.js";
import type { PersistOp, Transport } from "../transport/transport.js";
import { createInprocessTransport } from "../transport/inprocess-transport.js";
import { createWorkerPersistenceService } from "./create-worker-persistence-service.js";

const createTestDb = () => {
    const plugin = Database.Plugin.create({
        components: {
            position: Vec3.schema,
            velocity: Vec3.schema,
            mass: F32.schema,
        },
        archetypes: {
            Particle: ["position", "velocity", "mass"],
        },
        transactions: {
            spawn(t, args: { x: number; y: number; z: number; mass: number }) {
                return t.archetypes.Particle.insert({
                    position: [args.x, args.y, args.z],
                    velocity: [0, 0, 0],
                    mass: args.mass,
                });
            },
            move(t, args: { entity: number; x: number; y: number; z: number }) {
                t.update(args.entity, { position: [args.x, args.y, args.z] });
            },
            kill(t, entity: number) {
                t.delete(entity);
            },
            updateAll(t, args: { entity: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; mass: number }) {
                t.update(args.entity, {
                    position: [args.x, args.y, args.z],
                    velocity: [args.vx, args.vy, args.vz],
                    mass: args.mass,
                });
            },
        },
    });
    return Database.create(plugin);
};

/**
 * Wrap an in-process transport so every PersistOp issued through
 * `send()` and `request()` is recorded into `ops`. Returns the spy
 * transport plus the recording array.
 */
const spyTransport = (inner: Transport): { transport: Transport; ops: PersistOp[] } => {
    const ops: PersistOp[] = [];
    const transport: Transport = {
        send(op, transfer) {
            ops.push(op);
            inner.send(op, transfer);
        },
        request(op, transfer) {
            ops.push(op);
            return inner.request(op, transfer);
        },
        onMessage: inner.onMessage.bind(inner),
        flush: inner.flush.bind(inner),
        close: inner.close.bind(inner),
    };
    return { transport, ops };
};

describe("persistence complexity contract: O(changes), not O(world)", () => {
    /**
     * For each world size N, populate N entities, then run an
     * identical small transaction and count the PersistOps it emitted.
     * The count must be equal across N.
     */
    const measureOpsForOneMove = async (N: number): Promise<number> => {
        const db = createTestDb();
        const backend = createMemoryBackend();
        const inner = createInprocessTransport(backend);
        const { transport, ops } = spyTransport(inner);
        const service = await createWorkerPersistenceService({
            database: db,
            backend,
            transport,
            // Disable auto-checkpoint so it never sneaks an extra op
            // burst into our measurement window.
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });

        // Populate N entities.
        const ids: number[] = [];
        for (let i = 0; i < N; i++) {
            const id = db.transactions.spawn({ x: i, y: i, z: i, mass: 1 });
            ids.push(id!);
        }
        await service.flush();

        // Snapshot op count, then run a single tiny tx that updates
        // one component on one entity in the middle of the world.
        const opsBefore = ops.length;
        db.transactions.move({ entity: ids[Math.floor(N / 2)]!, x: 1, y: 2, z: 3 });
        await service.flush();
        const opsForOneMove = ops.length - opsBefore;

        await service.dispose();
        await transport.close();
        return opsForOneMove;
    };

    it("a single-component update emits the same op count regardless of world size", async () => {
        const counts = await Promise.all([
            measureOpsForOneMove(100),
            measureOpsForOneMove(1_000),
            measureOpsForOneMove(10_000),
        ]);
        // All three must be identical: the per-tx op count is a
        // function of the diff (1 entity × 1 component touched), not N.
        expect(counts[0]).toBe(counts[1]);
        expect(counts[1]).toBe(counts[2]);
        // And it should be tiny — concretely:
        //   1 journal entry  (position update)
        // + 1 column slice   (position bytes)
        // + 1 ELT update     (entity location)
        // + 1 commit entry
        // = 4 ops per single-component, single-entity transaction.
        expect(counts[0]).toBe(4);
    });

    it("a multi-component update on one entity emits ops proportional to touched columns, not world size", async () => {
        const measure = async (N: number): Promise<number> => {
            const db = createTestDb();
            const backend = createMemoryBackend();
            const inner = createInprocessTransport(backend);
            const { transport, ops } = spyTransport(inner);
            const service = await createWorkerPersistenceService({
                database: db,
                backend,
                transport,
                checkpoint: { everyNTransactions: 0, idleMs: 0 },
            });

            const ids: number[] = [];
            for (let i = 0; i < N; i++) {
                ids.push(db.transactions.spawn({ x: i, y: i, z: i, mass: 1 })!);
            }
            await service.flush();

            const opsBefore = ops.length;
            db.transactions.updateAll({
                entity: ids[Math.floor(N / 2)]!,
                x: 1, y: 2, z: 3,
                vx: 4, vy: 5, vz: 6,
                mass: 7,
            });
            await service.flush();
            const out = ops.length - opsBefore;
            await service.dispose();
            await transport.close();
            return out;
        };

        const counts = await Promise.all([
            measure(100),
            measure(1_000),
            measure(10_000),
        ]);
        expect(counts[0]).toBe(counts[1]);
        expect(counts[1]).toBe(counts[2]);
        // 3 columns touched (position, velocity, mass) → 3 journal entries
        // + 3 column slices + 1 ELT update + 1 commit = 8 ops.
        expect(counts[0]).toBe(8);
    });

    it("an insert emits ops proportional to columns in the destination archetype, not world size", async () => {
        const measure = async (N: number): Promise<number> => {
            const db = createTestDb();
            const backend = createMemoryBackend();
            const inner = createInprocessTransport(backend);
            const { transport, ops } = spyTransport(inner);
            const service = await createWorkerPersistenceService({
                database: db,
                backend,
                transport,
                checkpoint: { everyNTransactions: 0, idleMs: 0 },
            });

            for (let i = 0; i < N; i++) {
                db.transactions.spawn({ x: i, y: i, z: i, mass: 1 });
            }
            await service.flush();

            const opsBefore = ops.length;
            db.transactions.spawn({ x: 0, y: 0, z: 0, mass: 0 });
            await service.flush();
            const out = ops.length - opsBefore;
            await service.dispose();
            await transport.close();
            return out;
        };

        const counts = await Promise.all([
            measure(100),
            measure(1_000),
            measure(10_000),
        ]);
        expect(counts[0]).toBe(counts[1]);
        expect(counts[1]).toBe(counts[2]);
        // Insert writes all destination columns + ELT + commit:
        //   3 journal entries + 3 column slices + 1 ELT + 1 commit = 8 ops.
        expect(counts[0]).toBe(8);
    });

    it("a delete emits ops proportional to (1 + swap-remove side effects), not world size", async () => {
        // Important: this measures the steady-state delete cost, where
        // an entity's removal causes ONE swap-move side effect (the
        // last row backfills the vacated row). We want the cost to
        // depend on that constant, not on N.
        const measure = async (N: number): Promise<number> => {
            const db = createTestDb();
            const backend = createMemoryBackend();
            const inner = createInprocessTransport(backend);
            const { transport, ops } = spyTransport(inner);
            const service = await createWorkerPersistenceService({
                database: db,
                backend,
                transport,
                checkpoint: { everyNTransactions: 0, idleMs: 0 },
            });

            const ids: number[] = [];
            for (let i = 0; i < N; i++) {
                ids.push(db.transactions.spawn({ x: i, y: i, z: i, mass: 1 })!);
            }
            await service.flush();

            const opsBefore = ops.length;
            // Delete an entity in the middle: the table swap-removes
            // by moving the LAST row into the vacated row. The
            // persistence service detects that move and emits a
            // synthetic "all columns" update for the swapped-in entity.
            db.transactions.kill(ids[Math.floor(N / 2)]!);
            await service.flush();
            const out = ops.length - opsBefore;
            await service.dispose();
            await transport.close();
            return out;
        };

        const counts = await Promise.all([
            measure(100),
            measure(1_000),
            measure(10_000),
        ]);
        expect(counts[0]).toBe(counts[1]);
        expect(counts[1]).toBe(counts[2]);
        // Delete cost:
        //   1 journal "delete" entry
        // + 1 ELT delete
        // + (swap-remove of last row → 3 journal entries + 3 column
        //    slices + 1 ELT update for the moved entity)
        // + 1 commit
        // = 10 ops.
        expect(counts[0]).toBe(10);
    });
});
