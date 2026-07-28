// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// A component whose schema is marked `nonPersistent: true` must not be saved.
// On load it is reconstructed via the hybrid rule: a defaulted one is reset to
// its default (present); a no-default one is stripped (the entity restores into
// the reduced archetype). This exercises the full worker/checkpoint/reload path.

import { Database } from "@adobe/data/ecs";
import type { Schema } from "@adobe/data/schema";
import { F32 } from "@adobe/data/math";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryBackend } from "../backend/memory-backend.js";
import { createWorkerPersistenceService } from "./create-worker-persistence-service.js";

const plugin = Database.Plugin.create({
    components: {
        value: F32.schema,
        // Defaulted nonPersistent component → reset to default on load.
        cache: { type: "number", default: 7, nonPersistent: true } as const,
        // No-default nonPersistent component → stripped on load.
        derived: { type: "number", nonPersistent: true } as const,
        // undefined-default (type-only placeholder, e.g. a GPUBuffer handle) →
        // treated as no default → stripped on load.
        gpuRef: { default: undefined as unknown, nonPersistent: true } satisfies Schema,
    },
    archetypes: {
        Item: ["value", "cache", "derived", "gpuRef"],
    },
    transactions: {
        spawn(t, args: { value: number; cache: number; derived: number; gpuRef: unknown }) {
            return t.archetypes.Item.insert(args);
        },
    },
});

const noCheckpoint = { everyNTransactions: 0, idleMs: 0 } as const;

describe("component-level nonPersistent durability", () => {
    let backend: ReturnType<typeof createMemoryBackend>;

    beforeEach(() => {
        backend = createMemoryBackend();
    });

    it("does not persist nonPersistent columns: defaulted resets, no-default strips", async () => {
        const db1 = Database.create(plugin);
        const svc1 = await createWorkerPersistenceService({ database: db1, backend, checkpoint: noCheckpoint });
        const e = db1.transactions.spawn({ value: 5, cache: 99, derived: 42, gpuRef: 12345 })!;
        await svc1.flush();
        await svc1.checkpoint();
        await svc1.dispose();

        const db2 = Database.create(plugin);
        const svc2 = await createWorkerPersistenceService({ database: db2, backend, checkpoint: noCheckpoint });
        await svc2.load();
        await svc2.dispose();

        const view = db2.read(e) as { value: number; cache?: number; derived?: number; gpuRef?: unknown } | null;
        expect(view).not.toBeNull();
        expect(view!.value).toBe(5);              // persistent component preserved
        expect(view!.cache).toBe(7);              // defaulted nonPersistent → reset to default
        expect("derived" in view!).toBe(false);   // no-default nonPersistent → stripped
        expect("gpuRef" in view!).toBe(false);    // null-default nonPersistent → stripped
    });
});
