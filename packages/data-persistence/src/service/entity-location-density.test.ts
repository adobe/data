// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// The on-disk entity-location file for each persistent quadrant is indexed by
// the entity's per-quadrant local index, so it packs with exactly one 8-byte
// slot per entity — no gaps from the quadrant bits in the entity id.

import { Database } from "@adobe/data/ecs";
import { F32 } from "@adobe/data/math";
import { describe, expect, it } from "vitest";
import { createMemoryBackend } from "../backend/memory-backend.js";
import { createWorkerPersistenceService } from "./create-worker-persistence-service.js";

const plugin = Database.Plugin.create({
    components: { value: F32.schema },
    archetypes: { Item: ["value"] },
    transactions: {
        spawn(t, v: number) {
            return t.archetypes.Item.insert({ value: v });
        },
    },
});

const ELT_STRIDE = 8;

describe("entity-location file density", () => {
    it("packs the document quadrant with exactly one slot per entity (no gaps)", async () => {
        const backend = createMemoryBackend();
        const db = Database.create(plugin);
        const svc = await createWorkerPersistenceService({
            database: db,
            backend,
            checkpoint: { everyNTransactions: 0, idleMs: 0 },
        });

        const N = 50;
        for (let i = 0; i < N; i++) db.transactions.spawn(i);
        await svc.flush();

        // Document entities get dense local indices 0..N-1 — the file is exactly
        // N slots, not stretched out by the entity id's quadrant bits.
        const eltFile = await backend.open("entity-location-0.bin");
        expect(await eltFile.size()).toBe(N * ELT_STRIDE);
        await eltFile.close();

        await svc.dispose();
    });
});
