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

    it('should return invalid location for out of bounds or deleted entities', () => {
        const table = createEntityLocationTable();

        expect(table.locate(999)).toEqual(null);

        const entity = table.create({ archetype: 1, row: 10 });
        table.delete(entity);
        expect(table.locate(entity)).toBe(null);
    });

    it('should grow capacity when adding many entities', () => {
        const initialCapacity = 16;
        const table = createEntityLocationTable(initialCapacity);
        const entities: Entity[] = [];

        for (let i = 0; i < initialCapacity + 5; i++) {
            const entity = table.create({ archetype: i, row: i * 10 });
            entities.push(entity);
            expect(entity & 0b11).toBe(0);
            expect(table.locate(entity)).toEqual({ archetype: i, row: i * 10 });
        }
        for (let i = 0; i < entities.length; i++) {
            expect(table.locate(entities[i]!)).toEqual({ archetype: i, row: i * 10 });
        }
    });

    it('should update entity locations correctly', () => {
        const table = createEntityLocationTable();

        const entity = table.create({ archetype: 1, row: 10 });
        table.update(entity, { archetype: 2, row: 20 });
        expect(table.locate(entity)).toEqual({ archetype: 2, row: 20 });
        table.update(entity, { archetype: 3, row: 30 });
        expect(table.locate(entity)).toEqual({ archetype: 3, row: 30 });

        const entity2 = table.create({ archetype: 4, row: 40 });
        expect(table.locate(entity)).toEqual({ archetype: 3, row: 30 });
        expect(table.locate(entity2)).toEqual({ archetype: 4, row: 40 });
    });

    it("should return null when locating an id that was never created", () => {
        const table = createEntityLocationTable();
        expect(table.locate(400)).toBeNull();
    });

    it("locates Entity.none as nothing", () => {
        const table = createEntityLocationTable();
        table.create({ archetype: 1, row: 0 });
        expect(table.locate(Entity.none)).toBeNull();
    });
});

describe('entity generations', () => {
    it.each([0, 1, 2, 3])('a deleted entity no longer locates once its slot is reused (quadrant %i)', (quadrant) => {
        const table = createEntityLocationTable(16, quadrant);
        const other = table.create({ archetype: 1, row: 1 });
        const entityA = table.create({ archetype: 1, row: 0 });

        table.delete(entityA);
        const entityB = table.create({ archetype: 2, row: 0 });

        expect(entityB).not.toBe(entityA);
        expect(Entity.toLocalIndex(entityB)).toBe(Entity.toLocalIndex(entityA));
        expect(Entity.generationOf(entityB)).toBe(Entity.generationOf(entityA) + 1);
        expect(table.locate(entityA)).toBeNull();
        expect(table.locate(entityB)).toEqual({ archetype: 2, row: 0 });
        expect(table.locate(other)).toEqual({ archetype: 1, row: 1 });
    });

    it('does not grow the table when slots are deleted and recreated', () => {
        const table = createEntityLocationTable(16, 0);
        let entity = table.create({ archetype: 1, row: 0 });
        for (let i = 0; i < 1000; i++) {
            table.delete(entity);
            entity = table.create({ archetype: 1, row: 0 });
        }
        expect((table.toData() as { nextIndex: number }).nextIndex).toBe(1);
    });

    it('reuses freed slots in LIFO order with advanced generations', () => {
        const table = createEntityLocationTable();
        const a = table.create({ archetype: 1, row: 0 });
        const b = table.create({ archetype: 1, row: 1 });
        const c = table.create({ archetype: 1, row: 2 });
        table.delete(b);
        table.delete(a);

        const first = table.create({ archetype: 2, row: 0 });
        const second = table.create({ archetype: 2, row: 1 });
        expect(Entity.toLocalIndex(first)).toBe(Entity.toLocalIndex(a));
        expect(Entity.toLocalIndex(second)).toBe(Entity.toLocalIndex(b));
        expect(table.locate(c)).toEqual({ archetype: 1, row: 2 });
    });

    it('wraps the generation after 256 frees of one slot', () => {
        const table = createEntityLocationTable();
        const first = table.create({ archetype: 1, row: 0 });
        let entity = first;
        for (let i = 0; i < 256; i++) {
            table.delete(entity);
            entity = table.create({ archetype: 1, row: 0 });
        }
        expect(Entity.generationOf(entity)).toBe(0);
        expect(entity).toBe(first);
    });

    it('delete ignores an id whose generation is stale', () => {
        const table = createEntityLocationTable();
        const a = table.create({ archetype: 1, row: 0 });
        table.delete(a);
        const b = table.create({ archetype: 2, row: 0 });

        table.delete(a);
        expect(table.locate(b)).toEqual({ archetype: 2, row: 0 });
    });

    it('keeps generations across a snapshot round-trip', () => {
        const table = createEntityLocationTable(16, 0);
        const a = table.create({ archetype: 1, row: 0 });
        const b = table.create({ archetype: 1, row: 1 });
        table.delete(a);
        const reused = table.create({ archetype: 3, row: 0 });
        table.delete(b);

        const restored = createEntityLocationTable(16, 0);
        restored.fromData(table.toData(true));

        expect(restored.locate(a)).toBeNull();
        expect(restored.locate(b)).toBeNull();
        expect(restored.locate(reused)).toEqual({ archetype: 3, row: 0 });
        const next = restored.create({ archetype: 4, row: 0 });
        expect(next).not.toBe(b);
        expect(Entity.generationOf(next)).toBe(Entity.generationOf(b) + 1);
    });

    it('detaches a copied snapshot from later mutation', () => {
        const table = createEntityLocationTable();
        const a = table.create({ archetype: 1, row: 0 });
        const snapshot = table.toData(true);
        table.delete(a);
        table.create({ archetype: 1, row: 0 });

        const restored = createEntityLocationTable();
        restored.fromData(snapshot);
        expect(restored.locate(a)).toEqual({ archetype: 1, row: 0 });
    });

    it('loads a snapshot without generations at generation 0', () => {
        const entities = new Int32Array(16 * 2);
        entities[0] = -1;
        entities[1] = -1;
        entities[2] = 3;
        entities[3] = 7;
        const restored = createEntityLocationTable(16, 0);
        restored.fromData({ entities, freeListHead: 0, nextIndex: 2, capacity: 16 });

        const live = Entity.toEntity(1, 0);
        expect(Entity.generationOf(live)).toBe(0);
        expect(restored.locate(live)).toEqual({ archetype: 3, row: 7 });
        expect(restored.locate(Entity.toEntity(0, 0))).toBeNull();

        const created = restored.create({ archetype: 4, row: 0 });
        expect(Entity.toLocalIndex(created)).toBe(0);
        expect(Entity.generationOf(created)).toBe(0);
        expect(restored.locate(created)).toEqual({ archetype: 4, row: 0 });
    });

    it('allocates correctly when a rebuilt snapshot has exactly filled its capacity', () => {
        const entries = Array.from({ length: 16 }, (_, i) => ({ entity: Entity.toEntity(i, 0), archetype: 1, row: i }));
        const restored = createEntityLocationTable(16, 0);
        restored.fromData(serializedEntityLocationTables(entries)[0]);

        const created = restored.create({ archetype: 2, row: 99 });
        expect(restored.locate(created)).toEqual({ archetype: 2, row: 99 });
        expect(restored.locate(Entity.toEntity(15, 0))).toEqual({ archetype: 1, row: 15 });
    });

    it('rewinding a delete leaves the generation so the next create repeats the id', () => {
        const table = createEntityLocationTable();
        const a = table.create({ archetype: 1, row: 0 });
        const b = table.create({ archetype: 1, row: 1 });

        table.delete(b, true);
        table.delete(a, true);

        expect(table.create({ archetype: 2, row: 0 })).toBe(a);
        expect(table.create({ archetype: 2, row: 1 })).toBe(b);
    });

    describe('restore', () => {
        it('puts a deleted entity back under its own generation', () => {
            const table = createEntityLocationTable();
            const a = table.create({ archetype: 1, row: 0 });
            table.delete(a);

            expect(table.restore(a, { archetype: 1, row: 5 })).toBe(true);
            expect(table.locate(a)).toEqual({ archetype: 1, row: 5 });

            const next = table.create({ archetype: 2, row: 0 });
            expect(Entity.toLocalIndex(next)).toBe(1);
        });

        it('takes the slot out of the free list wherever it sits', () => {
            const table = createEntityLocationTable();
            const a = table.create({ archetype: 1, row: 0 });
            const b = table.create({ archetype: 1, row: 1 });
            table.delete(a);
            table.delete(b);

            expect(table.restore(a, { archetype: 3, row: 9 })).toBe(true);
            const next1 = table.create({ archetype: 4, row: 0 });
            const next2 = table.create({ archetype: 4, row: 1 });
            expect(Entity.toLocalIndex(next1)).toBe(Entity.toLocalIndex(b));
            expect(Entity.toLocalIndex(next2)).toBe(2);
            expect(table.locate(a)).toEqual({ archetype: 3, row: 9 });
        });

        it('restores past the high-water mark, freeing the slots in between', () => {
            const table = createEntityLocationTable(16, 2);
            const far = Entity.toEntity(40, 2, 3);

            expect(table.restore(far, { archetype: 1, row: 0 })).toBe(true);
            expect(table.locate(far)).toEqual({ archetype: 1, row: 0 });
            const next = table.create({ archetype: 2, row: 0 });
            expect(Entity.toLocalIndex(next)).toBe(39);
        });

        it('refuses when the slot is live', () => {
            const table = createEntityLocationTable();
            const a = table.create({ archetype: 1, row: 0 });

            expect(table.restore(Entity.toEntity(0, 0, 7), { archetype: 2, row: 0 })).toBe(false);
            expect(table.locate(a)).toEqual({ archetype: 1, row: 0 });
        });
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

describe('serializedEntityLocationTables', () => {
    it('rebuilds holes as free slots and keeps each slot generation', () => {
        const live = Entity.toEntity(2, 0, 5);
        const freed = Entity.toEntity(1, 0, 9);
        const tables = serializedEntityLocationTables([
            { entity: live, archetype: 1, row: 0 },
            { entity: freed, archetype: -1, row: 0 },
        ]);
        const restored = createEntityLocationTable(16, 0);
        restored.fromData(tables[0]);

        expect(restored.locate(live)).toEqual({ archetype: 1, row: 0 });
        expect(restored.locate(freed)).toBeNull();
        expect(restored.locate(Entity.toEntity(1, 0, 8))).toBeNull();

        const created = restored.create({ archetype: 2, row: 0 });
        expect(created).toBe(freed);
    });

    it('ignores non-persistent quadrants', () => {
        const tables = serializedEntityLocationTables([{ entity: Entity.toEntity(0, 1), archetype: 1, row: 0 }]);
        expect(tables[1]).toBeUndefined();
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

    it('keeps generations', () => {
        const table = createEntityLocationTable();
        const a = table.create({ archetype: 0, row: 0 });
        table.delete(a);
        const b = table.create({ archetype: 0, row: 0 });

        const restored = createEntityLocationTable();
        restored.fromData(remapSerializedArchetypeIds(table.toData(true), [3]));
        expect(restored.locate(b)).toEqual({ archetype: 3, row: 0 });
        expect(restored.locate(a)).toBeNull();
    });
});
