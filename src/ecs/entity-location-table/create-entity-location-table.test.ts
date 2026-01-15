// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from 'vitest';
import { createEntityLocationTable } from './create-entity-location-table.js';
import { Entity } from '../entity.js';

describe('createEntityLocationTable', () => {
    it('should create entities with increasing ids starting from 0', () => {
        const table = createEntityLocationTable();

        const entity0 = table.create({ archetype: 1, row: 10 });
        const entity1 = table.create({ archetype: 2, row: 20 });
        const entity2 = table.create({ archetype: 3, row: 30 });

        expect(entity0).toBe(0);
        expect(entity1).toBe(1);
        expect(entity2).toBe(2);
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
        expect(entity3).toBe(1);

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
        expect(newEntity1).toBe(0); // Should get entity0's id (last deleted)
        expect(table.locate(newEntity1)).toEqual({ archetype: 5, row: 50 });

        const newEntity2 = table.create({ archetype: 6, row: 60 });
        expect(newEntity2).toBe(2); // Should get entity2's id (second-to-last deleted)
        expect(table.locate(newEntity2)).toEqual({ archetype: 6, row: 60 });

        const newEntity3 = table.create({ archetype: 7, row: 70 });
        expect(newEntity3).toBe(1); // Should get entity1's id (first deleted)
        expect(table.locate(newEntity3)).toEqual({ archetype: 7, row: 70 });

        // Creating one more should create a new ID since free list is empty
        const newEntity4 = table.create({ archetype: 8, row: 80 });
        expect(newEntity4).toBe(4); // Should get a new ID
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
            // Verify entity was created correctly
            expect(entity).toBe(i);
            const location = table.locate(entity);
            expect(location).toEqual({ archetype: i, row: i * 10 });
        }

        // Delete some entities that span across the initial capacity boundary
        table.delete(initialCapacity - 1);
        table.delete(initialCapacity);
        table.delete(initialCapacity + 1);

        // Create new entities and verify they reuse the deleted IDs
        const newEntity1 = table.create({ archetype: 100, row: 1000 });
        const newEntity2 = table.create({ archetype: 101, row: 1010 });
        const newEntity3 = table.create({ archetype: 102, row: 1020 });

        // Verify the entities were reused in LIFO order
        expect(newEntity1).toBe(initialCapacity + 1);
        expect(newEntity2).toBe(initialCapacity);
        expect(newEntity3).toBe(initialCapacity - 1);

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

    it("should return null when locating entity with invalid id -1", () => {
        const table = createEntityLocationTable();
        expect(() => table.locate(-1)).toThrow("locate entity must be >= 0");
    });
});

describe('createTransientEntityLocationTable', () => {
    it('should create entities with increasing ids starting from -1', () => {
        const table = createEntityLocationTable(16, true);

        const entity0 = table.create({ archetype: 1, row: 10 });
        const entity1 = table.create({ archetype: 2, row: 20 });
        const entity2 = table.create({ archetype: 3, row: 30 });

        expect(entity0).toBe(-1);
        expect(entity1).toBe(-2);
        expect(entity2).toBe(-3);

        expect(table.locate(entity0)).toEqual({ archetype: 1, row: 10 });
        expect(table.locate(entity1)).toEqual({ archetype: 2, row: 20 });
        expect(table.locate(entity2)).toEqual({ archetype: 3, row: 30 });
    });
});