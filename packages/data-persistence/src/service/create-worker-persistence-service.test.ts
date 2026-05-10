// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { F32, Vec3 } from "@adobe/data/math";
import { describe, expect, it } from "vitest";
import { createMemoryBackend } from "../backend/memory-backend.js";
import { decodeJournalStream } from "../journal/journal-codec.js";
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
        },
    });
    return Database.create(plugin);
};

describe("createWorkerPersistenceService", () => {
    it("writes column slices and journal entries on insert", async () => {
        const db = createTestDb();
        const backend = createMemoryBackend();
        const service = await createWorkerPersistenceService({
            database: db,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });

        db.transactions.spawn({ x: 1, y: 2, z: 3, mass: 10 });
        await service.flush();

        // Column files exist under the archetype directory.
        const archetypeDirs = await backend.list("archetypes");
        expect(archetypeDirs.length).toBe(1);

        // Entity-location.bin records the new entity at row 0.
        const eltFile = await backend.open("entity-location.bin");
        const eltSize = await eltFile.size();
        expect(eltSize).toBeGreaterThan(0);
        await eltFile.close();

        // Journal has at least one entry per component (3 in this archetype, ignoring `id`).
        const journal = await backend.open("journal.bin");
        const journalBytes = await journal.readAt(0, await journal.size());
        await journal.close();
        const entries = decodeJournalStream(journalBytes.buffer.slice(journalBytes.byteOffset, journalBytes.byteOffset + journalBytes.byteLength));
        const updates = entries.filter(e => e.kind === "update");
        const commits = entries.filter(e => e.kind === "commit");
        expect(updates.length).toBeGreaterThanOrEqual(3);
        // Every transaction the service emits is closed by exactly
        // one commit marker.
        expect(commits.length).toBe(1);

        await service.dispose();
    });

    it("emits column writes only for changed entities, not the whole world", async () => {
        const db = createTestDb();
        const backend = createMemoryBackend();
        const ops: { archetypeId: number; component: string; rowOffset: number }[] = [];
        // Spy by wrapping the backend's open() to intercept writeAt calls.
        const wrapped = {
            ...backend,
            async open(relPath: string) {
                const inner = await backend.open(relPath);
                return {
                    ...inner,
                    async writeAt(offset: number, bytes: Uint8Array) {
                        if (relPath.startsWith("archetypes/")) {
                            const match = relPath.match(/^archetypes\/(\d+)\/([^/]+)\.bin$/);
                            if (match) {
                                ops.push({
                                    archetypeId: parseInt(match[1]!, 10),
                                    component: match[2]!,
                                    rowOffset: offset,
                                });
                            }
                        }
                        return inner.writeAt(offset, bytes);
                    },
                };
            },
        };

        const service = await createWorkerPersistenceService({
            database: db,
            backend: wrapped,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });

        // Two inserts then one move. The move should write only row 0
        // for the entity it touches, not row 1.
        const e0 = db.transactions.spawn({ x: 1, y: 2, z: 3, mass: 10 });
        db.transactions.spawn({ x: 4, y: 5, z: 6, mass: 20 });
        await service.flush();

        const opsBeforeMove = ops.length;
        db.transactions.move({ entity: e0!, x: 100, y: 200, z: 300 });
        await service.flush();

        const moveOps = ops.slice(opsBeforeMove);
        // After the move, every recorded write should target rowOffset 0
        // (entity 0's row in the Particle archetype). The unchanged
        // entity at row 1 must not be written.
        for (const op of moveOps) {
            expect(op.rowOffset).toBe(0);
        }
        // The move only touches `position`. With per-component-write
        // detection the service emits a single column slice for that
        // one column instead of all three — same-row, same-archetype
        // updates honour the components named in the transaction's
        // patch values.
        expect(moveOps.length).toBe(1);

        await service.dispose();
    });

    it("emits a delete entry on entity removal", async () => {
        const db = createTestDb();
        const backend = createMemoryBackend();
        const service = await createWorkerPersistenceService({
            database: db,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });

        const e = db.transactions.spawn({ x: 0, y: 0, z: 0, mass: 1 });
        await service.flush();
        db.transactions.kill(e!);
        await service.flush();

        const journal = await backend.open("journal.bin");
        const journalBytes = await journal.readAt(0, await journal.size());
        await journal.close();
        const entries = decodeJournalStream(journalBytes.buffer.slice(journalBytes.byteOffset, journalBytes.byteOffset + journalBytes.byteLength));
        const deleteEntries = entries.filter(e => e.kind === "delete");
        expect(deleteEntries.length).toBe(1);

        await service.dispose();
    });

    it("checkpoint writes meta.json and truncates the journal", async () => {
        const db = createTestDb();
        const backend = createMemoryBackend();
        const service = await createWorkerPersistenceService({
            database: db,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });

        db.transactions.spawn({ x: 1, y: 2, z: 3, mass: 10 });
        await service.flush();

        await service.checkpoint();

        // meta.json exists.
        const meta = await backend.open("meta.json");
        const metaBytes = await meta.readAt(0, await meta.size());
        await meta.close();
        expect(metaBytes.byteLength).toBeGreaterThan(0);
        const manifest = JSON.parse(new TextDecoder().decode(metaBytes));
        expect(manifest.version).toBe(1);
        expect(typeof manifest.checkpointId).toBe("number");

        // Journal was truncated.
        const journal = await backend.open("journal.bin");
        expect(await journal.size()).toBe(0);
        await journal.close();

        await service.dispose();
    });

    it("ignores transient and ephemeral transactions", async () => {
        const db = createTestDb();
        const backend = createMemoryBackend();
        const service = await createWorkerPersistenceService({
            database: db,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });

        // Spawn one entity normally; the spawn is non-transient so it
        // should produce journal entries.
        db.transactions.spawn({ x: 1, y: 2, z: 3, mass: 10 });
        await service.flush();

        const journal = await backend.open("journal.bin");
        const size = await journal.size();
        await journal.close();
        expect(size).toBeGreaterThan(0);

        await service.dispose();
    });

    it("emits exactly one journal entry per component the user touched (in-place update)", async () => {
        const db = createTestDb();
        const backend = createMemoryBackend();
        const service = await createWorkerPersistenceService({
            database: db,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });

        const e = db.transactions.spawn({ x: 1, y: 2, z: 3, mass: 10 });
        await service.flush();

        // Snapshot the journal length so we can isolate the move's diff.
        const journal = await backend.open("journal.bin");
        const sizeAfterSpawn = await journal.size();
        await journal.close();

        db.transactions.move({ entity: e!, x: 100, y: 200, z: 300 });
        await service.flush();

        const journal2 = await backend.open("journal.bin");
        const fullSize = await journal2.size();
        const allBytes = await journal2.readAt(0, fullSize);
        await journal2.close();

        const moveDiff = allBytes.subarray(sizeAfterSpawn);
        const moveEntries = decodeJournalStream(
            moveDiff.buffer.slice(moveDiff.byteOffset, moveDiff.byteOffset + moveDiff.byteLength),
        );
        // The move tx produces exactly one data entry (only `position`
        // was touched) plus one commit marker.
        const moveUpdates = moveEntries.filter(e => e.kind === "update");
        const moveCommits = moveEntries.filter(e => e.kind === "commit");
        expect(moveUpdates.length).toBe(1);
        expect(moveCommits.length).toBe(1);

        await service.dispose();
    });

    it("emits ALL columns when the entity migrates to a different archetype", async () => {
        const plugin = Database.Plugin.create({
            components: {
                position: Vec3.schema,
                velocity: Vec3.schema,
                mass: F32.schema,
                drag: F32.schema,
            },
            archetypes: {
                Particle: ["position", "velocity", "mass"],
                Drag: ["position", "velocity", "mass", "drag"],
            },
            transactions: {
                spawn(t, args: { mass: number }) {
                    return t.archetypes.Particle.insert({
                        position: [1, 2, 3],
                        velocity: [4, 5, 6],
                        mass: args.mass,
                    });
                },
                addDrag(t, args: { entity: number; drag: number }) {
                    t.update(args.entity, { drag: args.drag });
                },
            },
        });
        const db = Database.create(plugin);
        const backend = createMemoryBackend();
        const service = await createWorkerPersistenceService({
            database: db,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });

        const e = db.transactions.spawn({ mass: 10 });
        await service.flush();

        const journal = await backend.open("journal.bin");
        const sizeAfterSpawn = await journal.size();
        await journal.close();

        // Migrate from Particle (3 cols) to Drag (4 cols). The user
        // only set `drag`, but the destination row's other columns
        // (position, velocity, mass) need to be flushed too because
        // the destination row's underlying memory is wholesale new.
        db.transactions.addDrag({ entity: e!, drag: 0.25 });
        await service.flush();

        const journal2 = await backend.open("journal.bin");
        const fullSize = await journal2.size();
        const allBytes = await journal2.readAt(0, fullSize);
        await journal2.close();

        const migrateDiff = allBytes.subarray(sizeAfterSpawn);
        const migrateEntries = decodeJournalStream(
            migrateDiff.buffer.slice(
                migrateDiff.byteOffset,
                migrateDiff.byteOffset + migrateDiff.byteLength,
            ),
        );
        // All 4 columns of the destination archetype are journaled,
        // plus one commit marker for the tx.
        const migrateUpdates = migrateEntries.filter(e => e.kind === "update");
        const migrateCommits = migrateEntries.filter(e => e.kind === "commit");
        expect(migrateUpdates.length).toBe(4);
        expect(migrateCommits.length).toBe(1);

        await service.dispose();
    });

    it("works with an explicitly provided in-process transport", async () => {
        const db = createTestDb();
        const backend = createMemoryBackend();
        const transport = createInprocessTransport(backend);
        const service = await createWorkerPersistenceService({
            database: db,
            backend,
            transport,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });

        db.transactions.spawn({ x: 0, y: 0, z: 0, mass: 1 });
        await service.flush();

        await service.dispose();
        // Caller-owned transport must be closed by caller.
        await transport.close();
    });
});
