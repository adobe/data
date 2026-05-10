// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { F32, Vec3 } from "@adobe/data/math";
import { describe, expect, it } from "vitest";
import { createMemoryBackend } from "../backend/memory-backend.js";
import { createWorkerPersistenceService } from "./create-worker-persistence-service.js";

/**
 * Round-trip tests: save the world via `WorkerPersistenceService`,
 * then build a fresh database with the same plugin and call `load()`,
 * and verify that the entity contents (positions, masses, etc.) are
 * recovered byte-for-byte.
 *
 * Uses an in-memory backend so the same backend instance backs both
 * the saving and loading service.
 */

const particlePlugin = Database.Plugin.create({
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
    },
});

const createDb = () => Database.create(particlePlugin);

const expectEntity = (
    db: ReturnType<typeof createDb>,
    entity: number,
    expected: { position: readonly number[]; velocity: readonly number[]; mass: number },
): void => {
    const view = db.read(entity) as
        | { position: ArrayLike<number>; velocity: ArrayLike<number>; mass: number }
        | null;
    expect(view).not.toBeNull();
    if (view === null) return;
    expect(Array.from(view.position)).toEqual([...expected.position]);
    expect(Array.from(view.velocity)).toEqual([...expected.velocity]);
    expect(view.mass).toBe(expected.mass);
};

describe("WorkerPersistenceService.load (round-trip)", () => {
    it("returns silently when no snapshot exists", async () => {
        const db = createDb();
        const backend = createMemoryBackend();
        const service = await createWorkerPersistenceService({
            database: db,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });

        await expect(service.load()).resolves.toBeUndefined();
        await service.dispose();
    });

    it("recovers a single inserted entity after checkpoint", async () => {
        const backend = createMemoryBackend();

        const dbA = createDb();
        const svcA = await createWorkerPersistenceService({
            database: dbA,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        const e = dbA.transactions.spawn({ x: 1, y: 2, z: 3, mass: 10 });
        await svcA.flush();
        await svcA.checkpoint();
        await svcA.dispose();

        const dbB = createDb();
        const svcB = await createWorkerPersistenceService({
            database: dbB,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        await svcB.load();

        expectEntity(dbB, e!, { position: [1, 2, 3], velocity: [0, 0, 0], mass: 10 });
        await svcB.dispose();
    });

    it("recovers multiple entities and preserves ids", async () => {
        const backend = createMemoryBackend();

        const dbA = createDb();
        const svcA = await createWorkerPersistenceService({
            database: dbA,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        const e0 = dbA.transactions.spawn({ x: 1, y: 2, z: 3, mass: 10 });
        const e1 = dbA.transactions.spawn({ x: 4, y: 5, z: 6, mass: 20 });
        const e2 = dbA.transactions.spawn({ x: 7, y: 8, z: 9, mass: 30 });
        await svcA.flush();
        await svcA.checkpoint();
        await svcA.dispose();

        const dbB = createDb();
        const svcB = await createWorkerPersistenceService({
            database: dbB,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        await svcB.load();

        expectEntity(dbB, e0!, { position: [1, 2, 3], velocity: [0, 0, 0], mass: 10 });
        expectEntity(dbB, e1!, { position: [4, 5, 6], velocity: [0, 0, 0], mass: 20 });
        expectEntity(dbB, e2!, { position: [7, 8, 9], velocity: [0, 0, 0], mass: 30 });
        await svcB.dispose();
    });

    it("recovers updates (move) made before checkpoint", async () => {
        const backend = createMemoryBackend();

        const dbA = createDb();
        const svcA = await createWorkerPersistenceService({
            database: dbA,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        const e = dbA.transactions.spawn({ x: 1, y: 2, z: 3, mass: 10 });
        dbA.transactions.move({ entity: e!, x: 100, y: 200, z: 300 });
        await svcA.flush();
        await svcA.checkpoint();
        await svcA.dispose();

        const dbB = createDb();
        const svcB = await createWorkerPersistenceService({
            database: dbB,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        await svcB.load();

        expectEntity(dbB, e!, { position: [100, 200, 300], velocity: [0, 0, 0], mass: 10 });
        await svcB.dispose();
    });

    it("recovers deletes: deleted entities are not present after load", async () => {
        const backend = createMemoryBackend();

        const dbA = createDb();
        const svcA = await createWorkerPersistenceService({
            database: dbA,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        const e0 = dbA.transactions.spawn({ x: 1, y: 2, z: 3, mass: 10 });
        const e1 = dbA.transactions.spawn({ x: 4, y: 5, z: 6, mass: 20 });
        dbA.transactions.kill(e0!);
        await svcA.flush();
        await svcA.checkpoint();
        await svcA.dispose();

        const dbB = createDb();
        const svcB = await createWorkerPersistenceService({
            database: dbB,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        await svcB.load();

        expect(dbB.read(e0!)).toBeNull();
        expectEntity(dbB, e1!, { position: [4, 5, 6], velocity: [0, 0, 0], mass: 20 });
        await svcB.dispose();
    });

    it("after load, new transactions allocate fresh ids without colliding", async () => {
        const backend = createMemoryBackend();

        const dbA = createDb();
        const svcA = await createWorkerPersistenceService({
            database: dbA,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        const e0 = dbA.transactions.spawn({ x: 1, y: 1, z: 1, mass: 1 });
        const e1 = dbA.transactions.spawn({ x: 2, y: 2, z: 2, mass: 2 });
        dbA.transactions.kill(e0!);
        await svcA.flush();
        await svcA.checkpoint();
        await svcA.dispose();

        const dbB = createDb();
        const svcB = await createWorkerPersistenceService({
            database: dbB,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        await svcB.load();

        // The deleted slot should be recycled by the free list.
        const eNew = dbB.transactions.spawn({ x: 9, y: 9, z: 9, mass: 9 });
        expect(eNew).toBe(e0);
        expectEntity(dbB, eNew!, { position: [9, 9, 9], velocity: [0, 0, 0], mass: 9 });
        // The pre-existing entity is still there.
        expectEntity(dbB, e1!, { position: [2, 2, 2], velocity: [0, 0, 0], mass: 2 });
        await svcB.dispose();
    });

    it("recovers a larger world (forces capacity growth)", async () => {
        const backend = createMemoryBackend();

        const dbA = createDb();
        const svcA = await createWorkerPersistenceService({
            database: dbA,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        // 100 entities, well above the default rowCapacity of 16, so
        // load() must grow the column buffers to fit.
        const ids: number[] = [];
        for (let i = 0; i < 100; i++) {
            const id = dbA.transactions.spawn({ x: i, y: i * 2, z: i * 3, mass: i * 0.5 });
            if (id !== undefined) ids.push(id);
        }
        await svcA.flush();
        await svcA.checkpoint();
        await svcA.dispose();

        const dbB = createDb();
        const svcB = await createWorkerPersistenceService({
            database: dbB,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });
        await svcB.load();

        for (let i = 0; i < ids.length; i++) {
            expectEntity(dbB, ids[i]!, {
                position: [i, i * 2, i * 3],
                velocity: [0, 0, 0],
                mass: i * 0.5,
            });
        }
        await svcB.dispose();
    });
});
