// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Browser E2E for the worker transport. Uses a real DOM Worker
// pointing at the bootstrap script, with the OPFS-backed router on
// the worker side. Vite/Vitest's transformer compiles the .ts worker
// entry on the fly via `new URL(...)`.

import { Database } from "@adobe/data/ecs";
import { F32, Vec3 } from "@adobe/data/math";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBrowserWorkerTransport } from "./browser-worker-transport.js";
import { createWorkerPersistenceService } from "../service/create-worker-persistence-service.js";

// Helper: build a transport over a freshly-spawned worker. Vite picks
// up `new Worker(new URL(...), { type: "module" })` and bundles the
// bootstrap as a separate worker chunk.
const spawnWorker = (): Worker =>
    new Worker(new URL("./browser-worker-bootstrap.ts", import.meta.url), { type: "module" });

// Each test gets its own clean OPFS root by clearing every entry under
// the per-origin OPFS directory before the test runs. Vitest browser
// shares the origin across tests, so without this we'd leak state.
const wipeOpfs = async (): Promise<void> => {
    if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) return;
    const root = await navigator.storage.getDirectory();
    const keys: string[] = [];
    for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys()) {
        keys.push(name);
    }
    for (const name of keys) {
        await root.removeEntry(name, { recursive: true } as FileSystemRemoveOptions);
    }
};

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
    },
});

describe("createBrowserWorkerTransport (E2E, OPFS)", () => {
    beforeEach(async () => {
        await wipeOpfs();
    });

    afterEach(async () => {
        await wipeOpfs();
    });

    it("round-trips entities through real Worker + OPFS", async () => {
        const { createMemoryBackend } = await import("../backend/memory-backend.js");
        let savedEntity: number | undefined;
        // Saving phase.
        {
            const db = Database.create(particlePlugin);
            const worker = spawnWorker();
            const transport = createBrowserWorkerTransport({ worker });
            // The backend on the main thread is unused at runtime when a
            // transport is supplied — the worker owns the real OPFS backend.
            // A memory backend satisfies the type seam.
            const service = await createWorkerPersistenceService({
                database: db,
                backend: createMemoryBackend(),
                transport,
                checkpoint: { everyNTransactions: 0, idleMs: 0 },
            });

            savedEntity = db.transactions.spawn({ x: 1, y: 2, z: 3, mass: 10 });
            db.transactions.move({ entity: savedEntity!, x: 100, y: 200, z: 300 });
            await service.flush();
            await service.checkpoint();

            await service.dispose();
            // Caller-owned transport: must close explicitly so the
            // worker shuts down and releases its OPFS access handles.
            await transport.close();
        }

        // Loading phase: brand-new worker, brand-new database.
        {
            const db = Database.create(particlePlugin);
            const worker = spawnWorker();
            const transport = createBrowserWorkerTransport({ worker });
            const service = await createWorkerPersistenceService({
                database: db,
                backend: createMemoryBackend(),
                transport,
                checkpoint: { everyNTransactions: 0, idleMs: 0 },
            });

            await service.load();

            const view = db.read(savedEntity!) as
                | { position: ArrayLike<number>; velocity: ArrayLike<number>; mass: number }
                | null;
            expect(view).not.toBeNull();
            if (view !== null) {
                expect(Array.from(view.position)).toEqual([100, 200, 300]);
                expect(Array.from(view.velocity)).toEqual([0, 0, 0]);
                expect(view.mass).toBe(10);
            }

            await service.dispose();
            await transport.close();
        }
    });

    it("survives multiple inserts and recovers all of them", async () => {
        const { createMemoryBackend } = await import("../backend/memory-backend.js");
        const ids: number[] = [];
        {
            const db = Database.create(particlePlugin);
            const worker = spawnWorker();
            const transport = createBrowserWorkerTransport({ worker });
            const service = await createWorkerPersistenceService({
                database: db,
                backend: createMemoryBackend(),
                transport,
                checkpoint: { everyNTransactions: 0, idleMs: 0 },
            });

            for (let i = 0; i < 10; i++) {
                const id = db.transactions.spawn({ x: i, y: i * 2, z: i * 3, mass: i * 0.5 });
                if (id !== undefined) ids.push(id);
            }
            await service.flush();
            await service.checkpoint();
            await service.dispose();
            await transport.close();
        }

        {
            const db = Database.create(particlePlugin);
            const worker = spawnWorker();
            const transport = createBrowserWorkerTransport({ worker });
            const service = await createWorkerPersistenceService({
                database: db,
                backend: createMemoryBackend(),
                transport,
                checkpoint: { everyNTransactions: 0, idleMs: 0 },
            });

            await service.load();

            for (let i = 0; i < ids.length; i++) {
                const view = db.read(ids[i]!) as
                    | { position: ArrayLike<number>; velocity: ArrayLike<number>; mass: number }
                    | null;
                expect(view).not.toBeNull();
                if (view !== null) {
                    expect(Array.from(view.position)).toEqual([i, i * 2, i * 3]);
                    expect(view.mass).toBe(i * 0.5);
                }
            }

            await service.dispose();
            await transport.close();
        }
    });
});
