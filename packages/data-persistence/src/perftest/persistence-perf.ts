// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, type Entity } from "@adobe/data/ecs";
import { F32, Vec3 } from "@adobe/data/math";
import { createMemoryBackend } from "../backend/memory-backend.js";
import { createWorkerPersistenceService } from "../service/create-worker-persistence-service.js";
import type { WorkerPersistenceService } from "../service/worker-persistence-service.js";
import type { PerfScenario } from "./perf-harness.js";

// All scenarios share this database shape so wall-time numbers
// are directly comparable across scenarios. Three components, one
// archetype — small enough that per-tx work is dominated by the
// persistence layer itself, not the schema's encoder cost.
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
            move(t, args: { entity: Entity; x: number; y: number; z: number }) {
                t.update(args.entity, { position: [args.x, args.y, args.z] });
            },
            updateAll(t, args: {
                entity: Entity;
                x: number; y: number; z: number;
                vx: number; vy: number; vz: number;
                mass: number;
            }) {
                t.update(args.entity, {
                    position: [args.x, args.y, args.z],
                    velocity: [args.vx, args.vy, args.vz],
                    mass: args.mass,
                });
            },
            kill(t, entity: Entity) {
                t.delete(entity);
            },
        },
    });
    return Database.create(plugin);
};

type TestDb = ReturnType<typeof createTestDb>;

interface ScenarioState {
    db: TestDb;
    service: WorkerPersistenceService;
    ids: Entity[];
}

const setupPopulated = async (n: number): Promise<ScenarioState> => {
    const db = createTestDb();
    const backend = createMemoryBackend();
    const service = await createWorkerPersistenceService({
        database: db,
        backend,
        // Disable both checkpoint paths so they never fire during a
        // measurement window and skew numbers. Each scenario that
        // wants to measure checkpoint cost calls it explicitly.
        checkpoint: { everyNTransactions: 0, idleMs: 0 },
    });
    const ids: Entity[] = [];
    for (let i = 0; i < n; i++) {
        const id = db.transactions.spawn({ x: i, y: i, z: i, mass: 1 });
        ids.push(id!);
    }
    await service.flush();
    return { db, service, ids };
};

/**
 * Steady-state per-tx update touching ONE component on ONE entity.
 *
 * This is the dominant case in real workloads: gameplay tick that
 * moves a few entities per frame. The per-component-write
 * optimization (architectural review #4) targets this case
 * specifically — its win shows up here as a 3× drop vs writing all
 * three columns per tx.
 */
const moveOneComponent = (): PerfScenario => {
    let state: ScenarioState | null = null;
    let cursor = 0;
    return {
        name: "tx: update 1 component on 1 entity (steady)",
        startN: 200,
        async setup(n) {
            state = await setupPopulated(1000);
            cursor = 0;
            void n; // n here is iterations per measurement, not world size
        },
        async run() {
            const s = state!;
            for (let i = 0; i < 200; i++) {
                const e = s.ids[cursor]!;
                cursor = (cursor + 1) % s.ids.length;
                s.db.transactions.move({ entity: e, x: i, y: i, z: i });
            }
            await s.service.flush();
        },
        async cleanup() {
            await state?.service.dispose();
            state = null;
        },
    };
};

const moveAllComponents = (): PerfScenario => {
    let state: ScenarioState | null = null;
    let cursor = 0;
    return {
        name: "tx: update 3 components on 1 entity",
        startN: 200,
        async setup() {
            state = await setupPopulated(1000);
            cursor = 0;
        },
        async run() {
            const s = state!;
            for (let i = 0; i < 200; i++) {
                const e = s.ids[cursor]!;
                cursor = (cursor + 1) % s.ids.length;
                s.db.transactions.updateAll({
                    entity: e,
                    x: i, y: i, z: i,
                    vx: -i, vy: -i, vz: -i,
                    mass: i + 1,
                });
            }
            await s.service.flush();
        },
        async cleanup() {
            await state?.service.dispose();
            state = null;
        },
    };
};

const insertSteady = (): PerfScenario => {
    let state: ScenarioState | null = null;
    return {
        name: "tx: insert (3 columns)",
        startN: 200,
        async setup() {
            state = await setupPopulated(1000);
        },
        async run() {
            const s = state!;
            for (let i = 0; i < 200; i++) {
                s.db.transactions.spawn({ x: i, y: i, z: i, mass: 1 });
            }
            await s.service.flush();
        },
        async cleanup() {
            await state?.service.dispose();
            state = null;
        },
    };
};

/**
 * Steady-state delete with the swap-remove side effect: the
 * persistence service detects the moved entity and emits a synthetic
 * full-row update for it. This scenario refills the working set in
 * setupBatch so the iteration count is pinned.
 */
const deleteWithSwap = (): PerfScenario => {
    let state: ScenarioState | null = null;
    let killCount = 0;
    return {
        name: "tx: delete + swap-remove side effect",
        startN: 100,
        async setup() {
            state = await setupPopulated(2000);
            killCount = 0;
        },
        async setupBatch() {
            // Refill the working set so each measurement iteration
            // has a known number of victims to kill. Done OUTSIDE
            // run() so its cost isn't attributed to delete.
            const s = state!;
            while (s.ids.length < 1000) {
                const id = s.db.transactions.spawn({ x: 0, y: 0, z: 0, mass: 1 });
                s.ids.push(id!);
            }
            await s.service.flush();
        },
        async run() {
            const s = state!;
            for (let i = 0; i < 100; i++) {
                // Always delete from the middle so swap-remove
                // actually triggers (deleting the LAST row would not).
                const idx = Math.floor(s.ids.length / 2);
                const e = s.ids[idx]!;
                s.ids.splice(idx, 1);
                s.db.transactions.kill(e);
                killCount += 1;
            }
            await s.service.flush();
        },
        async cleanup() {
            void killCount;
            await state?.service.dispose();
            state = null;
        },
    };
};

const checkpointAfterUpdates = (): PerfScenario => {
    let state: ScenarioState | null = null;
    let cursor = 0;
    return {
        name: "checkpoint: after 1k updates",
        startN: 1,
        async setup() {
            state = await setupPopulated(1000);
            cursor = 0;
        },
        async setupBatch() {
            // Dirty 1k rows since the last checkpoint so the
            // checkpoint actually has work to do (write a full
            // manifest, then truncate the journal).
            const s = state!;
            for (let i = 0; i < 1000; i++) {
                const e = s.ids[cursor]!;
                cursor = (cursor + 1) % s.ids.length;
                s.db.transactions.move({ entity: e, x: i, y: i, z: i });
            }
            await s.service.flush();
        },
        async run() {
            await state!.service.checkpoint();
        },
        async cleanup() {
            await state?.service.dispose();
            state = null;
        },
    };
};

/**
 * Cold-start load(): populate, checkpoint, dispose, then create a
 * fresh service with a fresh database against the SAME backend and
 * measure load() time. This is the single-shot recovery path users
 * see at app startup.
 */
const loadCold = (): PerfScenario => {
    let backend: ReturnType<typeof createMemoryBackend> | null = null;
    let svc: WorkerPersistenceService | null = null;
    let db: TestDb | null = null;
    return {
        name: "load: 1k entities, single-shot",
        startN: 1,
        async setup() {
            // One-time prep: build a fully-checkpointed snapshot in
            // the backend that we'll re-load each iteration.
            const seedDb = createTestDb();
            backend = createMemoryBackend();
            const seedSvc = await createWorkerPersistenceService({
                database: seedDb,
                backend,
                checkpoint: { everyNTransactions: 0, idleMs: 0 },
            });
            for (let i = 0; i < 1000; i++) {
                seedDb.transactions.spawn({ x: i, y: i, z: i, mass: 1 });
            }
            await seedSvc.flush();
            await seedSvc.checkpoint();
            await seedSvc.dispose();
        },
        async setupBatch() {
            // A fresh database + service per iteration — load() is a
            // one-shot operation and reusing the same service would
            // make replay no-op after the first iteration.
            if (svc !== null) await svc.dispose();
            db = createTestDb();
            svc = await createWorkerPersistenceService({
                database: db,
                backend: backend!,
                checkpoint: { everyNTransactions: 0, idleMs: 0 },
            });
        },
        async run() {
            await svc!.load();
        },
        async cleanup() {
            await svc?.dispose();
            svc = null;
            db = null;
            backend = null;
        },
    };
};

export const persistenceScenarios: readonly PerfScenario[] = [
    moveOneComponent(),
    moveAllComponents(),
    insertSteady(),
    deleteWithSwap(),
    checkpointAfterUpdates(),
    loadCold(),
];
