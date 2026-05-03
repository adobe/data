// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Node E2E for the worker-thread transport. Uses real `node:worker_threads`
// + real `node:fs`, with the database driving the persistence service
// over the worker boundary.
//
// Requires: `pnpm build` to have produced `dist/node/node-worker-bootstrap.js`.
// In CI this is sequenced by the package build script; locally, run
// `pnpm --filter @adobe/data-persistence build` before this file's tests.

import { Database } from "@adobe/data/ecs";
import { F32, Vec3 } from "@adobe/data/math";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createNodeFsBackend } from "./node-fs-backend.js";
import { createNodeWorkerTransport } from "./node-worker-transport.js";
import { createWorkerPersistenceService } from "../service/create-worker-persistence-service.js";

// Resolve the built worker bootstrap script. The transport defaults to
// `new URL("./node-worker-bootstrap.js", import.meta.url)` which would
// pick up the .ts source file URL when vitest is running against the
// source tree — Node can't load .ts directly, so we explicitly point
// at the dist artifact.
const repoBuiltBootstrap = (): URL => {
    const here = fileURLToPath(import.meta.url);
    // src/node/foo.test.ts → dist/node/node-worker-bootstrap.js
    const distPath = resolve(here, "../../../dist/node/node-worker-bootstrap.js");
    return new URL(`file://${distPath}`);
};

const ensureBuilt = (): URL => {
    const url = repoBuiltBootstrap();
    if (!existsSync(fileURLToPath(url))) {
        throw new Error(
            `Worker bootstrap not built yet. Run \`pnpm --filter @adobe/data-persistence build\`. Expected: ${fileURLToPath(url)}`,
        );
    }
    return url;
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

describe("createNodeWorkerTransport (E2E)", () => {
    let tmpRoot: string;

    beforeEach(async () => {
        tmpRoot = await mkdtemp(join(tmpdir(), "data-persistence-e2e-"));
    });

    afterEach(async () => {
        await rm(tmpRoot, { recursive: true, force: true });
    });

    it("round-trips entities through real worker_threads + fs", async () => {
        const workerScript = ensureBuilt();

        // Saving phase: drive the database, persist via the worker.
        let savedEntity: number | undefined;
        {
            const db = Database.create(particlePlugin);
            const transport = createNodeWorkerTransport({ root: tmpRoot, workerScript });
            const backend = await createNodeFsBackend(tmpRoot);
            const service = await createWorkerPersistenceService({
                database: db,
                backend,
                transport,
                checkpoint: { everyNTransactions: 0, idleMs: 0 },
            });

            savedEntity = db.transactions.spawn({ x: 1, y: 2, z: 3, mass: 10 });
            db.transactions.move({ entity: savedEntity!, x: 100, y: 200, z: 300 });
            await service.flush();
            await service.checkpoint();

            await service.dispose();
            await transport.close();
        }

        // Verify on-disk artifacts exist.
        const metaStat = await stat(join(tmpRoot, "meta.json"));
        expect(metaStat.size).toBeGreaterThan(0);
        const eltStat = await stat(join(tmpRoot, "entity-location.bin"));
        expect(eltStat.size).toBeGreaterThan(0);

        // Loading phase: fresh database, same plugin, recover via load().
        {
            const db = Database.create(particlePlugin);
            const transport = createNodeWorkerTransport({ root: tmpRoot, workerScript });
            const backend = await createNodeFsBackend(tmpRoot);
            const service = await createWorkerPersistenceService({
                database: db,
                backend,
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

    it("writes column files and entity-location.bin via the worker", async () => {
        const workerScript = ensureBuilt();

        const db = Database.create(particlePlugin);
        const transport = createNodeWorkerTransport({ root: tmpRoot, workerScript });
        const backend = await createNodeFsBackend(tmpRoot);
        const service = await createWorkerPersistenceService({
            database: db,
            backend,
            transport,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });

        for (let i = 0; i < 5; i++) {
            db.transactions.spawn({ x: i, y: i * 2, z: i * 3, mass: i });
        }
        await service.flush();
        await service.checkpoint();

        // Each archetype gets its own subdirectory; Particle has 3 columns.
        const archetypeDirs = await backend.list("archetypes");
        expect(archetypeDirs.length).toBe(1);
        const archetypeDir = archetypeDirs[0]!;
        const cols = [...(await backend.list(`archetypes/${archetypeDir}`))].sort();
        // position, velocity, mass — all .bin files. The implicit `id`
        // column is intentionally not persisted (it's recoverable from
        // entity-location.bin).
        expect(cols).toEqual(["mass.bin", "position.bin", "velocity.bin"]);

        await service.dispose();
        await transport.close();
    });
});
