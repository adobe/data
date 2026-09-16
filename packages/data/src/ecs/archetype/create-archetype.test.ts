// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from 'vitest';
import { createArchetype, type Archetype } from '../archetype/index.js';
import { createEntityLocationTable } from '../entity-location-table/index.js';
import { Entity } from '../entity/entity.js';
import { U32 } from '../../math/u32/index.js';

describe('createArchetype', () => {
    it('should create an archetype with basic components', () => {
        const entityLocationTable = createEntityLocationTable();
        const components = {
            id: Entity.schema,
            value: U32.schema,
        };
        const id = 1;

        const archetype = createArchetype(components, id, entityLocationTable);

        // Verify basic properties
        expect(archetype.id).toBe(id);
        expect(archetype.rowCount).toBe(0);
        expect(archetype.components).toEqual(new Set(['id', 'value']));
        expect(archetype.columns).toHaveProperty('id');
        expect(archetype.columns).toHaveProperty('value');
    });

    it('should create entities with correct ids and data', () => {
        const entityLocationTable = createEntityLocationTable();
        const components = {
            id: Entity.schema,
            value: U32.schema,
        };
        const id = 1;

        const archetype = createArchetype(components, id, entityLocationTable);

        // Create first entity
        const entity1 = archetype.insert({ value: 42 });
        expect(entity1).toBe(0); // First entity should have id 0
        expect(archetype.rowCount).toBe(1);
        expect(archetype.columns.id.get(0)).toBe(0);
        expect(archetype.columns.value.get(0)).toBe(42);

        // Create second entity
        const entity2 = archetype.insert({ value: 100 });
        expect(entity2).toBe(4); // Second entity: local index 1 in quadrant 0 → id 4
        expect(archetype.rowCount).toBe(2);
        expect(archetype.columns.id.get(1)).toBe(entity2);
        expect(archetype.columns.value.get(1)).toBe(100);

        // Verify entity locations in EntityLocationTable
        const location1 = entityLocationTable.locate(entity1);
        expect(location1).toEqual({ archetype: id, row: 0 });

        const location2 = entityLocationTable.locate(entity2);
        expect(location2).toEqual({ archetype: id, row: 1 });
    });

    it('should handle multiple component types', () => {
        const entityLocationTable = createEntityLocationTable();
        const components = {
            id: Entity.schema,
            health: U32.schema,
            mana: U32.schema,
            level: U32.schema,
        };
        const id = 2;

        const archetype = createArchetype(components, id, entityLocationTable);

        // Verify components are set up correctly
        expect(archetype.components).toEqual(new Set(['id', 'health', 'mana', 'level']));
        expect(archetype.columns).toHaveProperty('health');
        expect(archetype.columns).toHaveProperty('mana');
        expect(archetype.columns).toHaveProperty('level');

        // Create an entity with all components
        const entity = archetype.insert({
            health: 100,
            mana: 50,
            level: 5,
        });

        expect(entity).toBe(0);
        expect(archetype.rowCount).toBe(1);
        expect(archetype.columns.health.get(0)).toBe(100);
        expect(archetype.columns.mana.get(0)).toBe(50);
        expect(archetype.columns.level.get(0)).toBe(5);
        expect(archetype.columns.id.get(0)).toBe(0);

        // Verify entity location
        const location = entityLocationTable.locate(entity);
        expect(location).toEqual({ archetype: id, row: 0 });
    });

    it('should serialize and deserialize archetype data correctly', () => {
        const entityLocationTable = createEntityLocationTable();
        const components = {
            id: Entity.schema,
            health: U32.schema,
            mana: U32.schema,
        };
        const id = 3;

        const archetype = createArchetype(components, id, entityLocationTable);

        // Add some data
        archetype.insert({ health: 100, mana: 50 });
        archetype.insert({ health: 75, mana: 25 });

        // Serialize the archetype
        const serializedData = archetype.toData();

        // Verify serialized data contains expected properties
        expect(serializedData).toHaveProperty('rowCount', 2);
        expect(serializedData).toHaveProperty('columns');
        expect((serializedData as any).columns).toHaveProperty('id');
        expect((serializedData as any).columns).toHaveProperty('health');
        expect((serializedData as any).columns).toHaveProperty('mana');

        // Create a new archetype and restore from serialized data
        const newArchetype = createArchetype(components, id, entityLocationTable);
        newArchetype.fromData(serializedData);

        // Verify the restored archetype has the same data
        expect(newArchetype.rowCount).toBe(2);
        expect(newArchetype.columns.health.get(0)).toBe(100);
        expect(newArchetype.columns.health.get(1)).toBe(75);
        expect(newArchetype.columns.mana.get(0)).toBe(50);
        expect(newArchetype.columns.mana.get(1)).toBe(25);
        expect(newArchetype.columns.id.get(0)).toBe(0);
        expect(newArchetype.columns.id.get(1)).toBe(4);
    });

    it('mints a default-factory component when the insert row omits it, fresh per insert', () => {
        const entityLocationTable = createEntityLocationTable();
        const components = { id: Entity.schema, value: U32.schema, seq: U32.schema };
        let next = 100;
        // Runtime invariant the compiler can't see: `seq` has a default factory, so
        // it is optional at insert. createArchetype's return type reports DK=never
        // (the core/store boundary is where DK is derived), so we assert it here.
        const archetype = createArchetype(components, 5, entityLocationTable, undefined, {
            seq: () => next++,
        }) as unknown as Archetype<{ value: number; seq: number }, "seq">;

        // seq omitted → minted by the factory, a fresh value each insert.
        archetype.insert({ value: 1 });
        archetype.insert({ value: 2 });
        expect(archetype.columns.seq.get(0)).toBe(100);
        expect(archetype.columns.seq.get(1)).toBe(101);
        expect(next).toBe(102);
    });

    it('uses the supplied value over the factory (replication-inbound / load path)', () => {
        const entityLocationTable = createEntityLocationTable();
        const components = { id: Entity.schema, seq: U32.schema };
        let calls = 0;
        // Runtime invariant the compiler can't see: `seq` is default-factory ⇒ DK.
        const archetype = createArchetype(components, 6, entityLocationTable, undefined, {
            seq: () => { calls++; return 999; },
        }) as unknown as Archetype<{ seq: number }, "seq">;

        archetype.insert({ seq: 7 });
        expect(archetype.columns.seq.get(0)).toBe(7);
        expect(calls).toBe(0); // factory never ran for a supplied value
    });

    it('applies default factories on the generic (non-identifier name) insert path', () => {
        const entityLocationTable = createEntityLocationTable();
        // A non-identifier component name forces buildGenericInsert (codegen is skipped).
        const components = { id: Entity.schema, ['weird-name']: U32.schema };
        let next = 10;
        // `any` archetype handle: this test exercises the runtime generic-insert
        // path, not the insert types (a non-identifier key isn't a valid TS field).
        const archetype: any = createArchetype(components as any, 7, entityLocationTable, undefined, {
            ['weird-name']: () => next++,
        });

        archetype.insert({}); // omitted → minted
        archetype.insert({ ['weird-name']: 42 }); // supplied → wins
        expect((archetype.columns as any)['weird-name'].get(0)).toBe(10);
        expect((archetype.columns as any)['weird-name'].get(1)).toBe(42);
        expect(next).toBe(11);
    });

    it('should preserve component set during serialization/deserialization', () => {
        const entityLocationTable = createEntityLocationTable();
        const components = {
            id: Entity.schema,
            value: U32.schema,
        };
        const id = 4;

        const archetype = createArchetype(components, id, entityLocationTable);
        const originalComponentSet = archetype.components;

        // Serialize and deserialize
        const serializedData = archetype.toData();
        archetype.fromData(serializedData);

        // Component set should remain unchanged (same reference)
        expect(archetype.components).toBe(originalComponentSet);
        expect(archetype.components).toEqual(new Set(['id', 'value']));
    });
}); 