// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// RED-then-GREEN durability tests for journal-storage ("array") columns.
//
// The bug being closed: "array" typed components have no snapshot file —
// their values ride in journal entries only. When a checkpoint runs it
// truncates the journal, permanently losing any value that was last
// written before the checkpoint. These tests expose the hole first
// (they must FAIL before the fix lands) then pass once the fix is in.

import { Database } from "@adobe/data/ecs";
import { F32 } from "@adobe/data/math";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryBackend } from "../backend/memory-backend.js";
import { createWorkerPersistenceService } from "./create-worker-persistence-service.js";

// Schema with both a fixed-stride column (mass: F32) and a variable-length
// "array" column (tags: string[]). The tags column uses the "array" typed
// buffer, which is what JournalColumnEncoder handles.
const tagsPlugin = Database.Plugin.create({
    components: {
        mass: F32.schema,
        tags: {
            type: "array",
            items: { type: "string" },
            default: [] as string[],
        } as const,
    },
    archetypes: {
        Item: ["mass", "tags"],
    },
    transactions: {
        spawn(t, args: { mass: number; tags: string[] }) {
            return t.archetypes.Item.insert({
                mass: args.mass,
                tags: args.tags,
            });
        },
        updateTags(t, args: { entity: number; tags: string[] }) {
            t.update(args.entity, { tags: args.tags });
        },
    },
});

const makeBackend = createMemoryBackend;
const noCheckpoint = { everyNTransactions: 0, idleMs: 0 } as const;

describe("journal-storage column durability", () => {
    let backend: ReturnType<typeof makeBackend>;

    beforeEach(() => {
        backend = makeBackend();
    });

    afterEach(async () => {
        // nothing to clean up for memory backend
    });

    it("array column value survives save → checkpoint → dispose → load", async () => {
        const db1 = Database.create(tagsPlugin);
        const svc1 = await createWorkerPersistenceService({
            database: db1,
            backend,
            checkpoint: noCheckpoint,
        });

        const entity = db1.transactions.spawn({ mass: 1.5, tags: ["alpha", "beta"] });
        await svc1.flush();
        await svc1.checkpoint();
        await svc1.dispose();

        // Fresh database, same backend → load should recover the tags.
        const db2 = Database.create(tagsPlugin);
        const svc2 = await createWorkerPersistenceService({
            database: db2,
            backend,
            checkpoint: noCheckpoint,
        });
        await svc2.load();
        await svc2.dispose();

        const view = db2.read(entity!) as { mass: number; tags: string[] } | null;
        expect(view).not.toBeNull();
        expect(view!.mass).toBe(1.5);
        expect(view!.tags).toEqual(["alpha", "beta"]);
    });

    it("array column value written after a checkpoint is recovered via journal replay", async () => {
        // Scenario: a prior checkpoint creates the manifest (so load() can
        // bootstrap). New entities are inserted AFTER the checkpoint and
        // flush()ed to the journal but never checkpointed. On reload the
        // journal replay must recover those post-checkpoint journal values.
        const db1 = Database.create(tagsPlugin);
        const svc1 = await createWorkerPersistenceService({
            database: db1,
            backend,
            checkpoint: noCheckpoint,
        });

        // First entity: lands in checkpoint (creates the manifest).
        const entityA = db1.transactions.spawn({ mass: 1, tags: ["before"] });
        await svc1.flush();
        await svc1.checkpoint();

        // Second entity: written after the checkpoint — lives only in the journal.
        const entityB = db1.transactions.spawn({ mass: 2, tags: ["gamma"] });
        await svc1.flush();
        // Intentionally no second checkpoint — simulate "crash after journal write".
        await svc1.dispose();

        const db2 = Database.create(tagsPlugin);
        const svc2 = await createWorkerPersistenceService({
            database: db2,
            backend,
            checkpoint: noCheckpoint,
        });
        await svc2.load();
        await svc2.dispose();

        // Entity A: restored from snapshot.
        const viewA = db2.read(entityA!) as { tags: string[] } | null;
        expect(viewA).not.toBeNull();
        expect(viewA!.tags).toEqual(["before"]);

        // Entity B: restored via journal replay — the journal-column value
        // must be present even though no second checkpoint was done.
        const viewB = db2.read(entityB!) as { mass: number; tags: string[] } | null;
        expect(viewB).not.toBeNull();
        expect(viewB!.tags).toEqual(["gamma"]);
    });

    it("post-checkpoint update wins over snapshot value", async () => {
        const db1 = Database.create(tagsPlugin);
        const svc1 = await createWorkerPersistenceService({
            database: db1,
            backend,
            checkpoint: noCheckpoint,
        });

        const entity = db1.transactions.spawn({ mass: 1, tags: ["before-checkpoint"] });
        await svc1.flush();
        await svc1.checkpoint(); // snapshot writes ["before-checkpoint"]

        db1.transactions.updateTags({ entity: entity!, tags: ["after-checkpoint"] });
        await svc1.flush(); // this lands in the (fresh, post-truncation) journal
        await svc1.dispose();

        const db2 = Database.create(tagsPlugin);
        const svc2 = await createWorkerPersistenceService({
            database: db2,
            backend,
            checkpoint: noCheckpoint,
        });
        await svc2.load();
        await svc2.dispose();

        const view = db2.read(entity!) as { mass: number; tags: string[] } | null;
        expect(view).not.toBeNull();
        // Journal replay runs AFTER snapshot restore, so "after-checkpoint" wins.
        expect(view!.tags).toEqual(["after-checkpoint"]);
    });

    it("multiple entities all have their array columns restored after checkpoint", async () => {
        const db1 = Database.create(tagsPlugin);
        const svc1 = await createWorkerPersistenceService({
            database: db1,
            backend,
            checkpoint: noCheckpoint,
        });

        const ids: number[] = [];
        for (let i = 0; i < 5; i++) {
            const id = db1.transactions.spawn({ mass: i, tags: [`tag-${i}-a`, `tag-${i}-b`] });
            ids.push(id!);
        }
        await svc1.flush();
        await svc1.checkpoint();
        await svc1.dispose();

        const db2 = Database.create(tagsPlugin);
        const svc2 = await createWorkerPersistenceService({
            database: db2,
            backend,
            checkpoint: noCheckpoint,
        });
        await svc2.load();
        await svc2.dispose();

        for (let i = 0; i < ids.length; i++) {
            const view = db2.read(ids[i]!) as { tags: string[] } | null;
            expect(view).not.toBeNull();
            expect(view!.tags).toEqual([`tag-${i}-a`, `tag-${i}-b`]);
        }
    });
});
