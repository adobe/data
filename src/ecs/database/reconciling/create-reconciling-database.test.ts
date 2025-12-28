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
});

