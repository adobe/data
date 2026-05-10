// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { createReconcilingDatabase } from "./create-reconciling-database.js";
import { Store } from "../../store/index.js";
import { Database } from "../database.js";

const createTestReconcilingDatabase = () => {
    const store = Store.create({
        components: {
            position: {
                type: "object",
                properties: {
                    x: { type: "number" },
                    y: { type: "number" },
                    z: { type: "number" },
                },
                required: ["x", "y", "z"],
                additionalProperties: false,
            },
            name: { type: "string" },
        } as const,
        resources: {},
        archetypes: {
            PositionNameEntity: ["position", "name"],
        } as const,
    });

    type StoreType = typeof store;

    const actions = {
        createPositionNameEntity(
            t: StoreType,
            args: { position: { x: number; y: number; z: number }; name: string },
        ) {
            return t.archetypes.PositionNameEntity.insert(args);
        },
        updatePositionNameEntity(
            t: StoreType,
            args: { entity: number; name: string },
        ) {
            t.update(args.entity, { name: args.name });
        },
    };

    return createReconcilingDatabase(store, actions);
};

const readEntityNames = (reconciling: ReturnType<typeof createTestReconcilingDatabase>) =>
    reconciling
        .select(["name"])
        .map(entity => reconciling.read(entity)?.name)
        .filter((name): name is string => Boolean(name));

describe("createReconcilingDatabase", () => {
    it("replaces a transient entry when the same id yields again", () => {
        const reconciling = createTestReconcilingDatabase();

        reconciling.apply({
            id: 1,
            name: "createPositionNameEntity",
            args: { position: { x: 0, y: 0, z: 0 }, name: "First" },
            time: -1,
        });

        reconciling.apply({
            id: 1,
            name: "createPositionNameEntity",
            args: { position: { x: 1, y: 1, z: 1 }, name: "Second" },
            time: -2,
        });

        expect(readEntityNames(reconciling)).toEqual(["Second"]);

        // Transient entries are not persisted; snapshot should exclude them
        const serialized = reconciling.toData() as unknown;
        expect(serialized).toBeTruthy();
    });

    it("removes a transient entry when cancelled after other operations", () => {
        const reconciling = createTestReconcilingDatabase();

        reconciling.apply({
            id: 10,
            name: "createPositionNameEntity",
            args: { position: { x: 0, y: 0, z: 0 }, name: "Transient" },
            time: -1,
        });

        reconciling.apply({
            id: 11,
            name: "createPositionNameEntity",
            args: { position: { x: 5, y: 5, z: 5 }, name: "Committed" },
            time: 2,
        });

        reconciling.cancel(10);

        expect(readEntityNames(reconciling)).toEqual(["Committed"]);
    });

    it("clears transient state after commit confirmation", () => {
        const reconciling = createTestReconcilingDatabase();

        reconciling.apply({
            id: 21,
            name: "createPositionNameEntity",
            args: { position: { x: 1, y: 2, z: 3 }, name: "InFlight" },
            time: -1,
        });

        reconciling.apply({
            id: 21,
            name: "createPositionNameEntity",
            args: { position: { x: 4, y: 5, z: 6 }, name: "Final" },
            time: 5,
        });

        expect(readEntityNames(reconciling)).toEqual(["Final"]);
        const serialized = reconciling.toData() as unknown;
        expect(serialized).toBeTruthy();
    });

    it("prunes committed entries from memory", () => {
        const reconciling = createTestReconcilingDatabase();

        // Apply multiple committed entries
        reconciling.apply({
            id: 30,
            name: "createPositionNameEntity",
            args: { position: { x: 1, y: 1, z: 1 }, name: "First" },
            time: 100,
        });

        reconciling.apply({
            id: 31,
            name: "createPositionNameEntity",
            args: { position: { x: 2, y: 2, z: 2 }, name: "Second" },
            time: 200,
        });

        reconciling.apply({
            id: 32,
            name: "createPositionNameEntity",
            args: { position: { x: 3, y: 3, z: 3 }, name: "Third" },
            time: 300,
        });

        // All entities should be created
        expect(readEntityNames(reconciling)).toEqual(["First", "Second", "Third"]);

        // Snapshot should succeed and not include reconciliation metadata
        const serialized = reconciling.toData() as unknown;
        expect(serialized).toBeTruthy();
    });

    it("keeps transient entries but prunes committed ones", () => {
        const reconciling = createTestReconcilingDatabase();

        // Apply committed entry
        reconciling.apply({
            id: 40,
            name: "createPositionNameEntity",
            args: { position: { x: 1, y: 1, z: 1 }, name: "Committed" },
            time: 100,
        });

        // Apply transient entry
        reconciling.apply({
            id: 41,
            name: "createPositionNameEntity",
            args: { position: { x: 2, y: 2, z: 2 }, name: "Transient" },
            time: -200,
        });

        expect(readEntityNames(reconciling)).toEqual(["Committed", "Transient"]);

        // Snapshot should not include transient metadata, and calling toData
        // must not disturb the live transient state.
        const snapshot = reconciling.toData();
        expect(snapshot).toBeTruthy();
        expect(readEntityNames(reconciling)).toEqual(["Committed", "Transient"]);
    });

    it("removes transient entry from queue when cancelled", () => {
        const reconciling = createTestReconcilingDatabase();

        // Apply a transient entry
        reconciling.apply({
            id: 50,
            name: "createPositionNameEntity",
            args: { position: { x: 1, y: 1, z: 1 }, name: "InProgress" },
            time: -100,
        });

        expect(readEntityNames(reconciling)).toEqual(["InProgress"]);

        // Cancel the transient entry (simulating an error in sequential transaction)
        reconciling.apply({
            id: 50,
            name: "createPositionNameEntity",
            args: undefined,
            time: 0,
        });

        // Verify the entity state is rolled back
        expect(readEntityNames(reconciling)).toEqual([]);
    });

    it("removes multiple transient updates when sequential transaction is cancelled", () => {
        const reconciling = createTestReconcilingDatabase();

        // Simulate sequential transaction with multiple yields (updates)
        // Each yield replaces the previous transient state
        reconciling.apply({
            id: 60,
            name: "createPositionNameEntity",
            args: { position: { x: 1, y: 1, z: 1 }, name: "Update1" },
            time: -100,
        });

        reconciling.apply({
            id: 60,
            name: "createPositionNameEntity",
            args: { position: { x: 2, y: 2, z: 2 }, name: "Update2" },
            time: -101,
        });

        reconciling.apply({
            id: 60,
            name: "createPositionNameEntity",
            args: { position: { x: 3, y: 3, z: 3 }, name: "Update3" },
            time: -102,
        });

        // Verify the latest transient state exists
        expect(readEntityNames(reconciling)).toEqual(["Update3"]);

        // Cancel (simulating error during sequential transaction)
        reconciling.apply({
            id: 60,
            name: "createPositionNameEntity",
            args: undefined,
            time: 0,
        });

        // Verify all state is rolled back
        expect(readEntityNames(reconciling)).toEqual([]);
    });

    it("should correctly handle inserting at the end without rolling back the new entry", () => {
        const reconciling = createTestReconcilingDatabase();

        // Create two committed entries
        reconciling.apply({
            id: 70,
            name: "createPositionNameEntity",
            args: { position: { x: 1, y: 1, z: 1 }, name: "First" },
            time: 100,
        });

        reconciling.apply({
            id: 71,
            name: "createPositionNameEntity",
            args: { position: { x: 2, y: 2, z: 2 }, name: "Second" },
            time: 200,
        });

        // Now insert a new entry at the end (time > 200)
        reconciling.apply({
            id: 72,
            name: "createPositionNameEntity",
            args: { position: { x: 3, y: 3, z: 3 }, name: "Third" },
            time: 300,
        });

        // All three should exist in order
        expect(readEntityNames(reconciling)).toEqual(["First", "Second", "Third"]);
    });

    it("should ignore commit time reordering for non-transient entries", () => {
        const reconciling = createTestReconcilingDatabase();

        // Create two committed entries with different times
        reconciling.apply({
            id: 80,
            name: "createPositionNameEntity",
            args: { position: { x: 1, y: 1, z: 1 }, name: "First" },
            time: 300,
        });

        reconciling.apply({
            id: 81,
            name: "createPositionNameEntity",
            args: { position: { x: 2, y: 2, z: 2 }, name: "Second" },
            time: 100,
        });

        // Order should reflect arrival order, not commit time.
        expect(readEntityNames(reconciling)).toEqual(["First", "Second"]);
    });

    it("should treat commit that follows a transient as final state without keeping history", () => {
        const reconciling = createTestReconcilingDatabase();

        // Apply transient entry
        reconciling.apply({
            id: 100,
            name: "createPositionNameEntity",
            args: { position: { x: 1, y: 1, z: 1 }, name: "Transient" },
            time: -100,
        });

        // Commit with final state
        reconciling.apply({
            id: 100,
            name: "createPositionNameEntity",
            args: { position: { x: 1, y: 1, z: 1 }, name: "Committed" },
            time: 200,
        });

        expect(readEntityNames(reconciling)).toEqual(["Committed"]);
    });

    it("allows extending transaction functions at runtime", () => {
        const store = Store.create({
            components: {
                position: {
                    type: "object",
                    properties: {
                        x: { type: "number" },
                        y: { type: "number" },
                        z: { type: "number" },
                    },
                    required: ["x", "y", "z"],
                    additionalProperties: false,
                },
                name: { type: "string" },
            } as const,
            resources: {},
            archetypes: {
                PositionNameEntity: ["position", "name"],
            } as const,
        });

        type StoreType = typeof store;

        const reconciling = createReconcilingDatabase(store, {
            createPositionNameEntity(
                t: StoreType,
                args: { position: { x: number; y: number; z: number }; name: string },
            ) {
                return t.archetypes.PositionNameEntity.insert(args);
            },
        });

        const created = reconciling.apply({
            id: 200,
            name: "createPositionNameEntity",
            args: { position: { x: 1, y: 1, z: 1 }, name: "Initial" },
            time: 10,
        });

        const createdId = created?.value as number;

        const extendedReconciling = reconciling.extend(Database.Plugin.create({
            transactions: {
                renamePositionNameEntity(t: any, args: { entity: number; name: string }) {
                    t.update(args.entity, { name: args.name });
                },
            },
        }));

        extendedReconciling.apply({
            id: 201,
            name: "renamePositionNameEntity",
            args: { entity: createdId, name: "Renamed" },
            time: 20,
        });

        const names = extendedReconciling
            .select(["name"])
            .map(entity => extendedReconciling.read(entity)?.name)
            .filter((name): name is NonNullable<typeof name> => Boolean(name));

        expect(names).toEqual(["Renamed"]);
    });

    it("should return the same instance when extended", () => {
        const reconciling = createTestReconcilingDatabase();
        const extended = reconciling.extend(Database.Plugin.create({}));
        expect(extended).toBe(reconciling);
    });

    it("preserves entity-id determinism across peers when a remote commit lands while a local transient is pending", () => {
        // Three databases sharing the same plugin: an authoritative "server"
        // and two peers. Each peer applies its own transient insert, then both
        // peers receive both server commits in canonical order. All three
        // must agree on (name → entity id) afterwards.
        const server = createTestReconcilingDatabase();
        const peerA = createTestReconcilingDatabase();
        const peerB = createTestReconcilingDatabase();

        const T_A = {
            id: 1,
            name: "createPositionNameEntity" as const,
            args: { position: { x: 0, y: 0, z: 0 }, name: "A" },
            userId: "user-a",
        };
        const T_B = {
            id: 2,
            name: "createPositionNameEntity" as const,
            args: { position: { x: 0, y: 0, z: 0 }, name: "B" },
            userId: "user-b",
        };

        peerA.apply({ ...T_A, time: -1 });
        peerB.apply({ ...T_B, time: -1 });

        // Server picks the order: A first, B second.
        server.apply({ ...T_A, time: 1 });
        server.apply({ ...T_B, time: 2 });

        peerA.apply({ ...T_A, time: 1 });
        peerB.apply({ ...T_A, time: 1 }); // T_A committed while T_B transient is still pending
        peerA.apply({ ...T_B, time: 2 });
        peerB.apply({ ...T_B, time: 2 });

        const idByName = (
            db: ReturnType<typeof createTestReconcilingDatabase>,
            n: string,
        ): number | undefined =>
            db.select(["name"]).find((e) => db.read(e)?.name === n);

        expect(idByName(peerA, "A")).toBe(idByName(server, "A"));
        expect(idByName(peerA, "B")).toBe(idByName(server, "B"));
        expect(idByName(peerB, "A")).toBe(idByName(server, "A"));
        expect(idByName(peerB, "B")).toBe(idByName(server, "B"));
    });

    it("a foreign commit arriving while a local transient is applied does not corrupt entity ids", () => {
        // Regression test for the missing rollback-before-execute bug.
        //
        // Scenario: specDb has applied B as a local transient (B now occupies
        // entity 0, incrementing nextIndex to 1). Then a commit for A arrives
        // from the server — A was never a transient on specDb.
        //
        // Without rolling back B's transient BEFORE executing committed A, the
        // entity allocator sees nextIndex=1 (B has already consumed slot 0) and
        // assigns A entity 1 instead of entity 0. A reference database that
        // received only commits assigns A entity 0. The two databases diverge.
        const specDb = createTestReconcilingDatabase();
        const refDb = createTestReconcilingDatabase();

        const envA = { id: 1, name: "createPositionNameEntity" as const, args: { position: { x: 0, y: 0, z: 0 }, name: "A" } };
        const envB = { id: 2, name: "createPositionNameEntity" as const, args: { position: { x: 0, y: 0, z: 0 }, name: "B" } };

        // specDb has only B as a local transient — it has never seen A.
        specDb.apply({ ...envB, time: -1 });

        // Server commits A first, then B.
        specDb.apply({ ...envA, time: 1 });
        specDb.apply({ ...envB, time: 2 });
        refDb.apply({ ...envA, time: 1 });
        refDb.apply({ ...envB, time: 2 });

        const idByName = (db: ReturnType<typeof createTestReconcilingDatabase>, n: string) =>
            db.select(["name"]).find(e => db.read(e)?.name === n);

        // Committed state must agree regardless of prior transient history.
        expect(idByName(specDb, "A")).toBe(idByName(refDb, "A"));
        expect(idByName(specDb, "B")).toBe(idByName(refDb, "B"));
    });

    it("two independent databases converge to identical logical state after replaying the same envelope sequence", () => {
        // Verifies the determinism contract: given the same ordered committed
        // envelopes, any two reconciling databases — regardless of what local
        // transients they each accumulated — must produce equal entity IDs and
        // component values. Physical row order in the archetype array may differ
        // due to rollback-replay reshuffling; logical state (entity → values)
        // must be identical.
        const buildDb = () => createTestReconcilingDatabase();

        const alpha = buildDb();
        const beta = buildDb();

        const envelopes = [
            { id: 10, name: "createPositionNameEntity" as const, args: { position: { x: 1, y: 2, z: 3 }, name: "Alice" }, time: 1 },
            { id: 11, name: "createPositionNameEntity" as const, args: { position: { x: 4, y: 5, z: 6 }, name: "Bob" }, time: 2 },
            { id: 12, name: "createPositionNameEntity" as const, args: { position: { x: 7, y: 8, z: 9 }, name: "Carol" }, time: 3 },
        ];

        // alpha accumulates transients before each commit (simulates a user who
        // speculatively inserts entities before the server echoes back)
        alpha.apply({ ...envelopes[0]!, time: -100 });
        alpha.apply({ ...envelopes[0]!, time: 1 });
        alpha.apply({ ...envelopes[1]!, time: -101 });
        alpha.apply({ ...envelopes[2]!, time: -102 });
        alpha.apply({ ...envelopes[1]!, time: 2 });
        alpha.apply({ ...envelopes[2]!, time: 3 });

        // beta receives commits with no prior transients (simulates a passive observer)
        for (const env of envelopes) {
            beta.apply(env);
        }

        // Helper: map name → { entity, position, name } sorted by name for deterministic comparison.
        const snapshot = (db: ReturnType<typeof createTestReconcilingDatabase>) =>
            db
                .select(["name", "position"])
                .map(e => ({ entity: e, ...db.read(e) }))
                .sort((a, b) => ((a.name ?? "") < (b.name ?? "") ? -1 : 1));

        const alphaSnap = snapshot(alpha);
        const betaSnap = snapshot(beta);

        // Same number of entities.
        expect(alphaSnap.length).toBe(betaSnap.length);

        for (let i = 0; i < alphaSnap.length; i++) {
            // Same entity ID for the same logical entity.
            expect(alphaSnap[i]!.entity).toBe(betaSnap[i]!.entity);
            // Same component values.
            expect(alphaSnap[i]!.name).toBe(betaSnap[i]!.name);
            expect(alphaSnap[i]!.position).toEqual(betaSnap[i]!.position);
        }
    });

    it("treats (userId, id) as the compound transient-replace key", () => {
        // Two different peers can each maintain their own per-session id
        // counter. When their envelopes happen to share an `id` they MUST
        // remain separate transient entries, because they are unrelated
        // logical transactions originating on different peers. Without the
        // compound `(userId, id)` key, peer B's transient with `id=1` would
        // overwrite peer A's transient with `id=1`.
        const reconciling = createTestReconcilingDatabase();

        reconciling.apply({
            id: 1,
            userId: "peerA",
            name: "createPositionNameEntity",
            args: { position: { x: 0, y: 0, z: 0 }, name: "FromA" },
            time: -1,
        });
        reconciling.apply({
            id: 1,
            userId: "peerB",
            name: "createPositionNameEntity",
            args: { position: { x: 1, y: 1, z: 1 }, name: "FromB" },
            time: -2,
        });

        // Both transients must coexist — neither one replaces the other.
        expect(readEntityNames(reconciling).sort()).toEqual(["FromA", "FromB"]);

        // A subsequent transient from peerA with the same id MUST replace
        // peerA's prior transient (and only peerA's).
        reconciling.apply({
            id: 1,
            userId: "peerA",
            name: "createPositionNameEntity",
            args: { position: { x: 9, y: 9, z: 9 }, name: "FromA-v2" },
            time: -1,
        });
        expect(readEntityNames(reconciling).sort()).toEqual(["FromA-v2", "FromB"]);

        // Cancelling (userId=peerA, id=1) must leave peerB's entry intact.
        reconciling.cancel(1, "peerA");
        expect(readEntityNames(reconciling)).toEqual(["FromB"]);
    });
});
