// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Probe: does an INTERMEDIATE transaction that relocates a persistent
// entity (via swap-remove) desync the persisted image?
//
// An async-generator transaction applies each non-final yield as an
// INTERMEDIATE step, rolls it back, then commits the return value. The
// persistence service skips intermediate transactions wholesale. The
// yield below deletes entity A, which swap-moves the last row (C) into
// A's vacated row; the rollback then re-inserts A at a fresh row. So by
// the time the (persisted) commit runs, A and C sit at different
// physical rows than the last checkpoint saw — a relocation the
// persistence layer never observed as part of a persisted transaction.
//
// The commit does a value-only update of A. If persistence decides a
// partial (per-component) write is safe, it writes A's one column at
// A's *current* row while the on-disk image still has a different
// entity's bytes there → corruption of the neighbor.

import { Database } from "@adobe/data/ecs";
import { F32 } from "@adobe/data/math";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryBackend } from "../backend/memory-backend.js";
import { createWorkerPersistenceService } from "./create-worker-persistence-service.js";

type Arg =
    | { kind: "kill"; entity: number }
    | { kind: "set"; entity: number; value: number };

const plugin = Database.Plugin.create({
    components: {
        value: F32.schema,
    },
    archetypes: {
        Item: ["value"],
    },
    transactions: {
        spawn(t, value: number) {
            return t.archetypes.Item.insert({ value });
        },
        killOrSet(t, arg: Arg) {
            if (arg.kind === "kill") {
                t.delete(arg.entity);
            } else {
                t.update(arg.entity, { value: arg.value });
            }
        },
    },
});

const noCheckpoint = { everyNTransactions: 0, idleMs: 0 } as const;

describe("intermediate relocation durability", () => {
    let backend: ReturnType<typeof createMemoryBackend>;

    beforeEach(() => {
        backend = createMemoryBackend();
    });

    it("keeps a swap-moved neighbor intact when a relocation happens inside an intermediate transaction", async () => {
        const db1 = Database.create(plugin);
        const svc1 = await createWorkerPersistenceService({
            database: db1,
            backend,
            checkpoint: noCheckpoint,
        });

        const a = db1.transactions.spawn(1)!;
        const b = db1.transactions.spawn(2)!;
        const c = db1.transactions.spawn(3)!;
        await svc1.flush();
        await svc1.checkpoint();

        // Intermediate delete of A (swap-moves C into A's row), rolled
        // back, then a persisted commit that value-updates A.
        db1.transactions.killOrSet(
            () =>
                (async function* (): AsyncGenerator<Arg, Arg, void> {
                    yield { kind: "kill", entity: a };
                    return { kind: "set", entity: a, value: 99 };
                })(),
        );
        await new Promise((resolve) => setTimeout(resolve, 25));
        await svc1.flush();
        await svc1.checkpoint();
        await svc1.dispose();

        const db2 = Database.create(plugin);
        const svc2 = await createWorkerPersistenceService({
            database: db2,
            backend,
            checkpoint: noCheckpoint,
        });
        await svc2.load();
        await svc2.dispose();

        const va = db2.read(a) as { value: number } | null;
        const vb = db2.read(b) as { value: number } | null;
        const vc = db2.read(c) as { value: number } | null;

        expect(va?.value).toBe(99);
        expect(vb?.value).toBe(2);
        expect(vc?.value).toBe(3);
    });
});
