// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from 'vitest';
import { createEntityLocationTable } from '../entity-location-table/index.js';
import { createArchetype, deleteRow } from './index.js';
import { Entity } from '../entity.js';
import { U32 } from '../../math/u32/index.js';

describe('Archetype_deleteRow', () => {
    it('should delete a row from the middle and update moved entity location', () => {
        const entityLocationTable = createEntityLocationTable();
        const archetype = createArchetype(
            {
                id: Entity.schema,
                value: U32.schema
            },
            1,
            entityLocationTable
        );

        // Create three entities
        const entity1 = archetype.insert({ value: 100 });
        const entity2 = archetype.insert({ value: 200 });
        const entity3 = archetype.insert({ value: 300 });

        // Delete the middle entity (entity2)
        deleteRow(archetype, entity2, entityLocationTable);

        // Verify entity3 was moved to position 1
        expect(archetype.columns.id.get(1)).toBe(entity3);
        expect(archetype.columns.value.get(1)).toBe(300);

        // Verify entity location table was updated for the moved entity
        const movedEntityLocation = entityLocationTable.locate(entity3);
        expect(movedEntityLocation).toEqual({ archetype: 1, row: 1 });

        // Verify total rows decreased
        expect(archetype.rowCount).toBe(2);

        // Verify entity1 is unchanged
        expect(archetype.columns.id.get(0)).toBe(entity1);
        expect(archetype.columns.value.get(0)).toBe(100);
    });

    it('should handle deleting the last row without moving entities', () => {
        const entityLocationTable = createEntityLocationTable();
        const archetype = createArchetype(
            {
                id: Entity.schema,
                value: U32.schema
            },
            1,
            entityLocationTable
        );

        // Create two entities
        const entity1 = archetype.insert({ value: 100 });
        const entity2 = archetype.insert({ value: 200 });

        // Delete the last entity (entity2)
        deleteRow(archetype, entity2, entityLocationTable);

        // Verify total rows decreased
        expect(archetype.rowCount).toBe(1);

        // Verify entity1 is unchanged
        expect(archetype.columns.id.get(0)).toBe(entity1);
        expect(archetype.columns.value.get(0)).toBe(100);
    });

    it('should handle deleting the only row', () => {
        const entityLocationTable = createEntityLocationTable();
        const archetype = createArchetype(
            {
                id: Entity.schema,
                value: U32.schema
            },
            1,
            entityLocationTable
        );

        // Create one entity
        const entity1 = archetype.insert({ value: 100 });

        // Delete the only entity
        deleteRow(archetype, 0, entityLocationTable);

        // Verify total rows is zero
        expect(archetype.rowCount).toBe(0);
    });
}); 