// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from 'vitest';
import { createEntityLocationTable, remapSerializedArchetypeIds } from './create-entity-location-table.js';
import { serializedEntityLocationTables } from './serialized-entity-location-tables.js';
import { Entity } from '../entity/entity.js';

describe('createEntityLocationTable', () => {
    it('should create entities with quadrant-encoded ids (quadrant 0)', () => {
        const table = createEntityLocationTable();

        const entity0 = table.create({ archetype: 1, row: 10 });
        const entity1 = table.create({ archetype: 2, row: 20 });
        const entity2 = table.create({ archetype: 3, row: 30 });

        // quadrant 0 packs local index n into id (n << 2): 0, 4, 8, …
        expect(entity0).toBe(0);
        expect(entity1).toBe(4);
        expect(entity2).toBe(8);
    });

    it('should store and retrieve entity locations correctly', () => {
        const table = createEntityLocationTable();

        const entity = table.create({ archetype: 42, row: 123 });
        const location = table.locate(entity);

        expect(location).toEqual({ archetype: 42, row: 123 });
    });

    it.each([1, 3])('should reuse deleted entity ids in non-persistent quadrant %i', (quadrant) => {
        const table = createEntityLocationTable(16, quadrant);

        const entity0 = table.create({ archetype: 1, row: 10 });
        const entity1 = table.create({ archetype: 2, row: 20 });
        const entity2 = table.create({ archetype: 3, row: 30 });

        // Delete entity1
        table.delete(entity1);

        // Create a new entity - should reuse entity1's id
        const entity3 = table.create({ archetype: 4, row: 40 });
        expect(entity3).toBe(entity1); // reuses entity1's freed slot (same id)

        // Verify the new entity's location
        const location = table.locate(entity3);
        expect(location).toEqual({ archetype: 4, row: 40 });
    });

    it('should reuse multiple deleted entities in LIFO order in non-persistent quadrants', () => {
        const table = createEntityLocationTable(16, 1);

        // Create initial entities
        const entity0 = table.create({ archetype: 1, row: 10 });
        const entity1 = table.create({ archetype: 2, row: 20 });
        const entity2 = table.create({ archetype: 3, row: 30 });
        const entity3 = table.create({ archetype: 4, row: 40 });

        // Delete entities in sequence
        table.delete(entity1); // First deletion
        table.delete(entity2); // Second deletion
        table.delete(entity0); // Third deletion

        // Recreate entities - should get IDs in reverse deletion order
        const newEntity1 = table.create({ archetype: 5, row: 50 });
        expect(newEntity1).toBe(entity0); // Should get entity0's id (last deleted)
        expect(table.locate(newEntity1)).toEqual({ archetype: 5, row: 50 });

        const newEntity2 = table.create({ archetype: 6, row: 60 });
        expect(newEntity2).toBe(entity2); // Should get entity2's id (second-to-last deleted)
        expect(table.locate(newEntity2)).toEqual({ archetype: 6, row: 60 });

        const newEntity3 = table.create({ archetype: 7, row: 70 });
        expect(newEntity3).toBe(entity1); // Should get entity1's id (first deleted)
        expect(table.locate(newEntity3)).toEqual({ archetype: 7, row: 70 });

        // Creating one more should create a new ID since free list is empty
        const newEntity4 = table.create({ archetype: 8, row: 80 });
        expect(newEntity4).toBe(entity3 + 4); // fresh id: next local index in quadrant 1
        expect(table.locate(newEntity4)).toEqual({ archetype: 8, row: 80 });
    });

    it('should return invalid location for out of bounds or deleted entities', () => {
        const table = createEntityLocationTable();

        // Out of bounds
        const outOfBoundsLocation = table.locate(999);
        expect(outOfBoundsLocation).toEqual(null);

        // Deleted entity
        const entity = table.create({ archetype: 1, row: 10 });
        table.delete(entity);
        const deletedLocation = table.locate(entity);
        expect(deletedLocation).toBe(null);
    });

    it('should grow capacity when adding many entities in a persistent quadrant without reusing deleted ids', () => {
        const initialCapacity = 16;
        const table = createEntityLocationTable(initialCapacity, 0);
        const entities: Entity[] = [];

        // Create more entities than initial capacity
        for (let i = 0; i < initialCapacity + 5; i++) {
            const entity = table.create({ archetype: i, row: i * 10 });
            entities.push(entity);
            expect(entity & 0b11).toBe(0);
            expect(table.locate(entity)).toEqual({ archetype: i, row: i * 10 });
        }

        // Delete entities spanning the initial capacity boundary
        const deleted = [
            entities[initialCapacity - 1]!,
            entities[initialCapacity]!,
            entities[initialCapacity + 1]!,
        ];
        for (const e of deleted) table.delete(e);

        // New entities advance monotonically and stale ids stay unlocatable
        const newEntity1 = table.create({ archetype: 100, row: 1000 });
        const newEntity2 = table.create({ archetype: 101, row: 1010 });
        const newEntity3 = table.create({ archetype: 102, row: 1020 });

        for (const stale of deleted) {
            expect(table.locate(stale)).toBeNull();
            expect(newEntity1).not.toBe(stale);
            expect(newEntity2).not.toBe(stale);
            expect(newEntity3).not.toBe(stale);
        }

        expect(table.locate(newEntity1)).toEqual({ archetype: 100, row: 1000 });
        expect(table.locate(newEntity2)).toEqual({ archetype: 101, row: 1010 });
        expect(table.locate(newEntity3)).toEqual({ archetype: 102, row: 1020 });
    });

    it('should grow capacity and reuse deleted ids in LIFO order in a non-persistent quadrant', () => {
        const initialCapacity = 16;
        const table = createEntityLocationTable(initialCapacity, 3);
        const entities: Entity[] = [];

        for (let i = 0; i < initialCapacity + 5; i++) {
            const entity = table.create({ archetype: i, row: i * 10 });
            entities.push(entity);
            expect(entity & 0b11).toBe(3);
            expect(table.locate(entity)).toEqual({ archetype: i, row: i * 10 });
        }

        table.delete(entities[initialCapacity - 1]!);
        table.delete(entities[initialCapacity]!);
        table.delete(entities[initialCapacity + 1]!);

        const newEntity1 = table.create({ archetype: 100, row: 1000 });
        const newEntity2 = table.create({ archetype: 101, row: 1010 });
        const newEntity3 = table.create({ archetype: 102, row: 1020 });

        expect(newEntity1).toBe(entities[initialCapacity + 1]);
        expect(newEntity2).toBe(entities[initialCapacity]);
        expect(newEntity3).toBe(entities[initialCapacity - 1]);

        expect(table.locate(newEntity1)).toEqual({ archetype: 100, row: 1000 });
        expect(table.locate(newEntity2)).toEqual({ archetype: 101, row: 1010 });
        expect(table.locate(newEntity3)).toEqual({ archetype: 102, row: 1020 });
    });

    it('should update entity locations correctly', () => {
        const table = createEntityLocationTable();

        // Create an initial entity
        const entity = table.create({ archetype: 1, row: 10 });
        expect(table.locate(entity)).toEqual({ archetype: 1, row: 10 });

        // Update the entity location
        table.update(entity, { archetype: 2, row: 20 });
        expect(table.locate(entity)).toEqual({ archetype: 2, row: 20 });

        // Update again to verify multiple updates work
        table.update(entity, { archetype: 3, row: 30 });
        expect(table.locate(entity)).toEqual({ archetype: 3, row: 30 });

        // Create another entity and verify the first one remains unchanged
        const entity2 = table.create({ archetype: 4, row: 40 });
        expect(table.locate(entity)).toEqual({ archetype: 3, row: 30 });
        expect(table.locate(entity2)).toEqual({ archetype: 4, row: 40 });
    });

    it("should return null when locating an id that was never created", () => {
        const table = createEntityLocationTable();
        expect(table.locate(400)).toBeNull();
    });
});

describe('quadrant-encoded entity location table', () => {
    it('packs the quadrant into each id (quadrant 1)', () => {
        const table = createEntityLocationTable(16, 1);

        const entity0 = table.create({ archetype: 1, row: 10 });
        const entity1 = table.create({ archetype: 2, row: 20 });
        const entity2 = table.create({ archetype: 3, row: 30 });

        // quadrant 1 packs local index n into id ((n << 2) | 1): 1, 5, 9, …
        expect(entity0).toBe(1);
        expect(entity1).toBe(5);
        expect(entity2).toBe(9);

        expect(table.locate(entity0)).toEqual({ archetype: 1, row: 10 });
        expect(table.locate(entity1)).toEqual({ archetype: 2, row: 20 });
        expect(table.locate(entity2)).toEqual({ archetype: 3, row: 30 });
    });

    it('keeps quadrant id-spaces disjoint under the & 0x3 mask', () => {
        for (const q of [0, 1, 2, 3]) {
            const table = createEntityLocationTable(16, q);
            const e = table.create({ archetype: 1, row: 0 });
            expect(e & 0b11).toBe(q);
        }
    });
});

describe('remapSerializedArchetypeIds', () => {
    it('throws naming entity index and archetype id when an occupied slot exceeds archetypeIdMap', () => {
        const table = createEntityLocationTable();
        table.create({ archetype: 0, row: 0 });
        table.create({ archetype: 5, row: 0 });
        const data = table.toData(true);

        expect(() => remapSerializedArchetypeIds(data, [2])).toThrow(
            /entity index 1.*archetype id 5/,
        );
    });

    it('ignores stale values beyond nextIndex left behind by reset', () => {
        const table = createEntityLocationTable();
        table.create({ archetype: 9, row: 0 });
        table.reset();
        const data = table.toData(true);

        expect(() => remapSerializedArchetypeIds(data, [0])).not.toThrow();
    });
});

describe('persistent quadrant stale-id protection', () => {
    it.each([0, 2])('does not reuse deleted entity ids in persistent quadrant %i', (quadrant) => {
        const table = createEntityLocationTable(16, quadrant);

        const entityA = table.create({ archetype: 1, row: 0 });
        const entityOther = table.create({ archetype: 1, row: 1 });

        table.delete(entityA);
        const entityB = table.create({ archetype: 2, row: 0 });

        expect(entityB).not.toBe(entityA);
        expect(table.locate(entityA)).toBeNull();
        expect(table.locate(entityB)).toEqual({ archetype: 2, row: 0 });
        expect(table.locate(entityOther)).toEqual({ archetype: 1, row: 1 });
    });

    it('keeps deleted ids unlocatable across snapshot round-trip', () => {
        const table = createEntityLocationTable(16, 0);
        const entityA = table.create({ archetype: 1, row: 0 });
        const entityB = table.create({ archetype: 1, row: 1 });
        table.delete(entityA);

        const snapshot = table.toData(true);
        const restored = createEntityLocationTable(16, 0);
        restored.fromData(snapshot);

        expect(restored.locate(entityA)).toBeNull();
        expect(restored.locate(entityB)).toEqual({ archetype: 1, row: 1 });

        const entityC = restored.create({ archetype: 2, row: 0 });
        expect(entityC).not.toBe(entityA);
        expect(restored.locate(entityA)).toBeNull();
        expect(restored.locate(entityC)).toEqual({ archetype: 2, row: 0 });
    });

    it('loads legacy snapshots that carry a non-empty free list without reusing freed slots', () => {
        // Legacy snapshot: slot 0 deleted (head of free list), slot 1 live, nextIndex = 2.
        const entities = new Int32Array(16 * 2);
        entities[0] = -1;
        entities[1] = -1;
        entities[2] = 3;
        entities[3] = 7;
        const legacySnapshot = {
            entities,
            freeListHead: 0,
            nextIndex: 2,
            capacity: 16,
        };

        const restored = createEntityLocationTable(16, 0);
        restored.fromData(legacySnapshot);

        const staleEntity0 = Entity.toEntity(0, 0);
        const liveEntity1 = Entity.toEntity(1, 0);

        expect(restored.locate(staleEntity0)).toBeNull();
        expect(restored.locate(liveEntity1)).toEqual({ archetype: 3, row: 7 });

        const created = restored.create({ archetype: 4, row: 0 });
        expect(created).not.toBe(staleEntity0);
        expect(restored.locate(staleEntity0)).toBeNull();
        expect(restored.locate(created)).toEqual({ archetype: 4, row: 0 });
    });

    it('does not reuse holes rebuilt by serializedEntityLocationTables', () => {
        const liveEntity = Entity.toEntity(2, 0);
        const holeEntity0 = Entity.toEntity(0, 0);
        const holeEntity1 = Entity.toEntity(1, 0);

        const tables = serializedEntityLocationTables([
            { entity: liveEntity, archetype: 1, row: 0 },
        ]);
        const restored = createEntityLocationTable(16, 0);
        restored.fromData(tables[0]);

        expect(restored.locate(liveEntity)).toEqual({ archetype: 1, row: 0 });
        expect(restored.locate(holeEntity0)).toBeNull();
        expect(restored.locate(holeEntity1)).toBeNull();

        const created = restored.create({ archetype: 2, row: 0 });
        expect(created).not.toBe(holeEntity0);
        expect(created).not.toBe(holeEntity1);
        expect(restored.locate(holeEntity0)).toBeNull();
        expect(restored.locate(holeEntity1)).toBeNull();
        expect(restored.locate(created)).toEqual({ archetype: 2, row: 0 });
    });

    it('restores a deleted persistent entity id without affecting monotonic allocation for new entities', () => {
        const table = createEntityLocationTable(16, 0);
        const a = table.create({ archetype: 1, row: 0 });
        const b = table.create({ archetype: 1, row: 1 });
        table.delete(a);
        expect(table.locate(a)).toBeNull();

        table.restore(a, { archetype: 1, row: 5 });
        expect(table.locate(a)).toEqual({ archetype: 1, row: 5 });
        expect(table.locate(b)).toEqual({ archetype: 1, row: 1 });

        const c = table.create({ archetype: 2, row: 0 });
        expect(c).not.toBe(a);
        expect(c).not.toBe(b);
    });

    it('restores a deleted non-persistent entity id and removes it from the free list', () => {
        const table = createEntityLocationTable(16, 1);
        const a = table.create({ archetype: 1, row: 0 });
        const b = table.create({ archetype: 1, row: 1 });
        table.delete(a);
        table.delete(b);

        // Restore `a` (which is behind `b` in the LIFO free list).
        table.restore(a, { archetype: 3, row: 9 });
        expect(table.locate(a)).toEqual({ archetype: 3, row: 9 });

        // Next two creates should pop `b`, then allocate fresh — never `a`.
        const next1 = table.create({ archetype: 4, row: 0 });
        const next2 = table.create({ archetype: 4, row: 1 });
        expect(next1).toBe(b);
        expect(next2).not.toBe(a);
        expect(table.locate(a)).toEqual({ archetype: 3, row: 9 });
    });

    it('rewinds nextIndex only when delete is called with rewind=true on the latest persistent slot', () => {
        const table = createEntityLocationTable(16, 0);
        const a = table.create({ archetype: 1, row: 0 });
        const b = table.create({ archetype: 1, row: 1 });

        // Rewinding the latest slot reclaims it for speculative rollback.
        table.delete(b, true);
        expect(table.locate(b)).toBeNull();
        expect(table.create({ archetype: 2, row: 0 })).toBe(b);

        // Rewinding a non-latest slot does not reclaim it.
        table.delete(a, true);
        expect(table.locate(a)).toBeNull();
        const c = table.create({ archetype: 2, row: 1 });
        expect(c).not.toBe(a);
        expect(table.locate(a)).toBeNull();
    });
});