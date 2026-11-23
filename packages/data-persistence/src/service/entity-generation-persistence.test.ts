// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database, Entity } from "@adobe/data/ecs";
import { F32 } from "@adobe/data/math";
import { describe, expect, it } from "vitest";
import { createMemoryBackend } from "../backend/memory-backend.js";
import { createWorkerPersistenceService } from "./create-worker-persistence-service.js";

// Entity ids carry a per-slot generation. Persistence stores it in the top byte of
// each entity-location slot's archetype word, so reloaded ids (and entity
// references persisted in component columns) keep resolving, and files written
// without generations load at generation 0.

const plugin = Database.Plugin.create({
    components: {
        mass: F32.schema,
        parent: Entity.schema,
    },
    archetypes: {
        Item: ["mass"],
        Child: ["mass", "parent"],
    },
    transactions: {
        spawn(t, mass: number) {
            return t.archetypes.Item.insert({ mass });
        },
        spawnChild(t, args: { mass: number; parent: Entity }) {
            return t.archetypes.Child.insert({ mass: args.mass, parent: args.parent });
        },
        kill(t, entity: Entity) {
            t.delete(entity);
        },
    },
});

const checkpointOptions = { everyNTransactions: 0, idleMs: 0 };

const save = async (backend: ReturnType<typeof createMemoryBackend>, body: (db: Database.FromPlugin<typeof plugin>) => void, checkpoint: boolean) => {
    const db = Database.create(plugin);
    const service = await createWorkerPersistenceService({ database: db, backend, checkpoint: checkpointOptions });
    // An empty checkpoint first, so a journal-only save still has a manifest to load from.
    await service.flush();
    await service.checkpoint();
    body(db);
    await service.flush();
    if (checkpoint) await service.checkpoint();
    await service.dispose();
};

const load = async (backend: ReturnType<typeof createMemoryBackend>) => {
    const db = Database.create(plugin);
    const service = await createWorkerPersistenceService({ database: db, backend, checkpoint: checkpointOptions });
    await service.load();
    return { db, service };
};

describe("entity generations survive persistence", () => {
    it.each([true, false])("a reused slot keeps its generation across a reload (checkpointed: %s)", async (checkpoint) => {
        const backend = createMemoryBackend();
        const ids: { stale?: Entity; reused?: Entity } = {};
        await save(backend, (db) => {
            ids.stale = db.transactions.spawn(1);
            db.transactions.kill(ids.stale!);
            ids.reused = db.transactions.spawn(2);
        }, checkpoint);

        expect(ids.reused).not.toBe(ids.stale);
        expect(Entity.generationOf(ids.reused!)).toBe(1);

        const { db, service } = await load(backend);
        expect(db.read(ids.stale!)).toBeNull();
        expect(db.read(ids.reused!)).toEqual({ mass: 2 });
        await service.dispose();
    });

    it.each([true, false])("a deleted slot keeps its next generation across a reload (checkpointed: %s)", async (checkpoint) => {
        const backend = createMemoryBackend();
        const ids: { deleted?: Entity } = {};
        await save(backend, (db) => {
            ids.deleted = db.transactions.spawn(1);
            db.transactions.kill(ids.deleted!);
        }, checkpoint);

        const { db, service } = await load(backend);
        expect(db.read(ids.deleted!)).toBeNull();
        const next = db.transactions.spawn(5);
        expect(Entity.toLocalIndex(next!)).toBe(Entity.toLocalIndex(ids.deleted!));
        expect(Entity.generationOf(next!)).toBe(Entity.generationOf(ids.deleted!) + 1);
        expect(db.read(ids.deleted!)).toBeNull();
        expect(db.read(next!)).toEqual({ mass: 5 });
        await service.dispose();
    });

    it.each([true, false])("an entity reference to a later-generation entity still resolves after a reload (checkpointed: %s)", async (checkpoint) => {
        const backend = createMemoryBackend();
        const ids: { parent?: Entity; child?: Entity } = {};
        await save(backend, (db) => {
            const scratch = db.transactions.spawn(0);
            db.transactions.kill(scratch!);
            ids.parent = db.transactions.spawn(1);
            ids.child = db.transactions.spawnChild({ mass: 2, parent: ids.parent! });
        }, checkpoint);

        expect(Entity.generationOf(ids.parent!)).toBe(1);

        const { db, service } = await load(backend);
        const child = db.read(ids.child!);
        expect(child).toEqual({ mass: 2, parent: ids.parent });
        expect(db.read(child!.parent!)).toEqual({ mass: 1 });
        await service.dispose();
    });

    it("writes generation 0 entries in the format written before generations", async () => {
        const backend = createMemoryBackend();
        const ids: Entity[] = [];
        await save(backend, (db) => {
            for (let i = 0; i < 3; i++) ids.push(db.transactions.spawn(i)!);
        }, true);

        const file = await backend.open("entity-location-0.bin");
        const bytes = await file.readAt(0, await file.size());
        await file.close();
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        expect(bytes.byteLength).toBe(3 * 8);
        for (let slot = 0; slot < 3; slot++) {
            // Unbiased archetype field only: generation byte is 0.
            expect(view.getUint32(slot * 8, true) >>> 24).toBe(0);
            expect(view.getUint32(slot * 8, true) & 0xffffff).toBeGreaterThan(0);
        }

        const { db, service } = await load(backend);
        ids.forEach((id, i) => expect(db.read(id)).toEqual({ mass: i }));
        await service.dispose();
    });

    it("loads entity-location files that carry no generation as generation 0", async () => {
        const backend = createMemoryBackend();
        const ids: Entity[] = [];
        await save(backend, (db) => {
            for (let i = 0; i < 3; i++) ids.push(db.transactions.spawn(i)!);
            db.transactions.kill(ids[1]!);
        }, true);

        // An older writer left the empty slot as all zeros.
        const file = await backend.open("entity-location-0.bin");
        await file.writeAt(1 * 8, new Uint8Array(8));
        await file.close();

        const { db, service } = await load(backend);
        expect(db.read(ids[0]!)).toEqual({ mass: 0 });
        expect(db.read(ids[1]!)).toBeNull();
        expect(db.read(ids[2]!)).toEqual({ mass: 2 });
        const next = db.transactions.spawn(9)!;
        expect(Entity.toLocalIndex(next)).toBe(1);
        expect(Entity.generationOf(next)).toBe(0);
        expect(db.read(next)).toEqual({ mass: 9 });
        await service.dispose();
    });
});
