// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database, Entity } from "@adobe/data/ecs";
import { F32 } from "@adobe/data/math";
import { describe, expect, it } from "vitest";
import { createMemoryBackend } from "../backend/memory-backend.js";
import type { Manifest } from "../encoder/types.js";
import { createWorkerPersistenceService } from "./create-worker-persistence-service.js";

// Entity ids carry a generation in memory but persist in the 0.10.x form: i32
// columns and journal values with no generation, reloaded at generation 0.

const nodePlugin = Database.Plugin.create({
    components: {
        parent: Entity.schema,
        target: { oneOf: [Entity.schema, { type: "null" }], default: null },
        link: { type: "object", properties: { to: Entity.schema, weight: F32.schema }, required: ["to", "weight"], default: { to: 0, weight: 0 } },
        members: { type: "array", items: Entity.schema, default: [] },
    },
    archetypes: { Node: ["parent", "target", "link", "members"] },
    transactions: {
        spawn(t, args: { parent: number; target: number | null; to: number; members: number[] }) {
            return t.archetypes.Node.insert({ parent: args.parent, target: args.target, link: { to: args.to, weight: 1 }, members: args.members });
        },
        kill(t, entity: number) {
            t.delete(entity);
        },
    },
});

const createDb = () => Database.create(nodePlugin);
const service = (db: ReturnType<typeof createDb>, backend: ReturnType<typeof createMemoryBackend>) =>
    createWorkerPersistenceService({ database: db, backend, checkpoint: { everyNTransactions: 0, idleMs: 0 } });

const readManifest = async (backend: ReturnType<typeof createMemoryBackend>): Promise<Manifest> => {
    const file = await backend.open("meta.json");
    return JSON.parse(new TextDecoder().decode(await file.readAt(0, await file.size())));
};

describe("entity references across persistence", () => {
    for (const checkpoint of [true, false]) {
        it(`round-trips entity references at generation 0 (${checkpoint ? "checkpoint" : "journal"})`, async () => {
            const backend = createMemoryBackend();
            const dbA = createDb();
            const svcA = await service(dbA, backend);
            const gone = dbA.transactions.spawn({ parent: 0, target: null, to: 0, members: [] })!;
            dbA.transactions.kill(gone);
            // Load needs a checkpoint; the journal variant writes the references after it.
            if (!checkpoint) {
                await svcA.flush();
                await svcA.checkpoint();
            }
            // Reuses gone's slot at generation 1: references to it are written without the generation.
            const a = dbA.transactions.spawn({ parent: 0, target: null, to: 0, members: [] })!;
            expect(Entity.generationOf(a)).toBe(1);
            const b = dbA.transactions.spawn({ parent: a, target: a, to: a, members: [a, a] })!;
            await svcA.flush();
            if (checkpoint) await svcA.checkpoint();
            await svcA.dispose();

            const dbB = createDb();
            const svcB = await service(dbB, backend);
            await svcB.load();
            const storedA = Entity.toEntity(Entity.toLocalIndex(a), 0);
            expect(dbB.read(b)).toEqual({ parent: storedA, target: storedA, link: { to: storedA, weight: 1 }, members: [storedA, storedA] });
            await svcB.dispose();
        });
    }

    it("stores entity columns as i32, as 0.10.x did", async () => {
        const backend = createMemoryBackend();
        const db = createDb();
        const svc = await service(db, backend);
        db.transactions.spawn({ parent: 0, target: null, to: 0, members: [] });
        await svc.flush();
        await svc.checkpoint();
        await svc.dispose();

        const columns = Object.values((await readManifest(backend)).archetypes).find((a) => "parent" in a.columns)!.columns;
        expect(columns.parent).toMatchObject({ stride: 4, storage: "fixed", bufferType: "number" });
        expect(columns.link).toMatchObject({ storage: "fixed", bufferType: "struct" });
        expect(columns.members).toMatchObject({ storage: "journal", bufferType: "array" });
    });
});
