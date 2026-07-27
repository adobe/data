// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from 'vitest';
import { createEntityLocationTable } from './create-entity-location-table.js';
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

    it('should reuse deleted entity ids', () => {
        const table = createEntityLocationTable();

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

    it('should reuse multiple deleted entities in LIFO order', () => {
        const table = createEntityLocationTable();

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
        expect(newEntity4).toBe(entity3 + 4); // fresh id: next local index in quadrant 0
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

    it('should grow capacity when adding many entities', () => {
        const initialCapacity = 16;
        const table = createEntityLocationTable(initialCapacity);
        const entities: Entity[] = [];

        // Create more entities than initial capacity
        for (let i = 0; i < initialCapacity + 5; i++) {
            const entity = table.create({ archetype: i, row: i * 10 });
            entities.push(entity);
            // Verify entity was created in quadrant 0 and round-trips
            expect(entity & 0b11).toBe(0);
            const location = table.locate(entity);
            expect(location).toEqual({ archetype: i, row: i * 10 });
        }

        // Delete some entities that span across the initial capacity boundary
        table.delete(entities[initialCapacity - 1]);
        table.delete(entities[initialCapacity]);
        table.delete(entities[initialCapacity + 1]);

        // Create new entities and verify they reuse the deleted IDs
        const newEntity1 = table.create({ archetype: 100, row: 1000 });
        const newEntity2 = table.create({ archetype: 101, row: 1010 });
        const newEntity3 = table.create({ archetype: 102, row: 1020 });

        // Verify the entities were reused in LIFO order
        expect(newEntity1).toBe(entities[initialCapacity + 1]);
        expect(newEntity2).toBe(entities[initialCapacity]);
        expect(newEntity3).toBe(entities[initialCapacity - 1]);

        // Verify their locations are correct
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