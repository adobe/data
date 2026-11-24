// © 2026 Adobe. MIT License. See /LICENSE for details.
import { resize } from "../../internal/array-buffer-like/resize.js";
import { EntityLocationTable } from "./entity-location-table.js";
import { EntityLocation } from "./entity-location.js";
import { Entity } from "../entity/entity.js";
import { toEntity, toLocalIndex, generationOf, nextGeneration } from "../entity/persistence-sharing.js";
import { createSharedArrayBuffer } from "../../internal/shared-array-buffer/create-shared-array-buffer.js";

/**
 * A location table for one entity quadrant (0..3). Slots are dense
 * per-quadrant local indices, each with a generation bumped when the slot is
 * freed. Each id packs its local index, the quadrant and the slot's generation
 * (see `persistence-sharing.ts`), so an id alone names its quadrant and a stale
 * id for a reused slot locates to null. `toData`/`fromData` serialize the raw
 * slot arrays (quadrant-agnostic); the quadrant is re-established by table
 * position on load.
 */
export const createEntityLocationTable = (initialCapacity: number = 16, quadrant: number = 0): EntityLocationTable => {
    let freeListHead = -1;
    let nextIndex = 0;
    let capacity = initialCapacity;
    let entities = new Int32Array(createSharedArrayBuffer(capacity * 2 * 4));
    let generations = new Uint32Array(createSharedArrayBuffer(capacity * 4));

    /** The local index `entity` names, or -1 when it is out of range, free or stale. */
    const liveIndex = (entity: Entity): number => {
        const index = toLocalIndex(entity);
        return index < nextIndex && entities[index << 1] >= 0 && generations[index] === generationOf(entity) ? index : -1;
    };

    const createEntity = ({ archetype, row }: EntityLocation): Entity => {
        if (row < 0) {
            throw new Error("create row must be >= 0");
        }
        let index: number;
        if (freeListHead >= 0) {
            index = freeListHead;
            freeListHead = entities[(index << 1) + 1];
        }
        else {
            index = nextIndex++;
            if (nextIndex >= capacity) {
                capacity *= 2;
                entities = new Int32Array(resize(entities.buffer, capacity * 2 * 4));
                generations = new Uint32Array(resize(generations.buffer, capacity * 4));
            }
        }

        entities[(index << 1) + 0] = archetype;
        entities[(index << 1) + 1] = row;

        return toEntity(index, quadrant, generations[index]);
    }

    const deleteEntity = (entity: Entity) => {
        const index = liveIndex(entity);
        if (index < 0) {
            return;
        }
        entities[(index << 1) + 0] = -1;
        entities[(index << 1) + 1] = freeListHead;
        generations[index] = nextGeneration(generations[index]);
        freeListHead = index;
    }

    const locateEntity = (entity: Entity): EntityLocation | null => {
        const index = liveIndex(entity);
        if (index < 0) {
            return null;
        }
        return { archetype: entities[index << 1], row: entities[(index << 1) + 1] };
    }

    const updateEntity = (entity: Entity, location: EntityLocation) => {
        if (entity < 0 || location.row < 0) {
            throw new Error("update entity and row must be >= 0");
        }
        const index = toLocalIndex(entity) << 1;
        entities[index + 0] = location.archetype;
        entities[index + 1] = location.row;
    }

    const claimEntity = (entity: Entity) => {
        const index = toLocalIndex(entity);
        while (index >= nextIndex) {
            // Slots below the claimed one that were never issued join the free list.
            entities[(nextIndex << 1) + 0] = -1;
            entities[(nextIndex << 1) + 1] = freeListHead;
            freeListHead = nextIndex++;
            if (nextIndex >= capacity) {
                capacity *= 2;
                entities = new Int32Array(resize(entities.buffer, capacity * 2 * 4));
                generations = new Uint32Array(resize(generations.buffer, capacity * 4));
            }
        }
        if (entities[index << 1] >= 0) {
            throw new Error(`claim entity ${entity}: its slot is in use`);
        }
        if (freeListHead !== index) {
            let cursor = freeListHead;
            while (entities[(cursor << 1) + 1] !== index) {
                cursor = entities[(cursor << 1) + 1];
            }
            entities[(cursor << 1) + 1] = entities[(index << 1) + 1];
            entities[(index << 1) + 1] = freeListHead;
            freeListHead = index;
        }
        generations[index] = generationOf(entity);
    }

    return {
        create: createEntity,
        delete: deleteEntity,
        claim: claimEntity,
        locate: locateEntity,
        update: updateEntity,
        reset: () => {
            // Every slot in use is freed, so its generation moves on and ids
            // issued before the reset stay stale.
            for (let index = 0; index < nextIndex; index++) {
                if (entities[index << 1] >= 0) {
                    generations[index] = nextGeneration(generations[index]);
                }
            }
            freeListHead = -1;
            nextIndex = 0;
        },
        toData: (copy = false) => ({
            entities: copy ? entities.slice() : entities,
            generations: copy ? generations.slice() : generations,
            freeListHead,
            nextIndex,
            capacity,
        }),
        fromData: (data: any) => {
            entities = data.entities;
            generations = data.generations;
            freeListHead = data.freeListHead;
            nextIndex = data.nextIndex;
            capacity = data.capacity;
        }
    };
}

const missingArchetypeError = (
    entityIndex: number,
    archetype: number,
    archetypeCount: number,
    source: string = "archetypesData",
): Error =>
    new Error(
        `Invalid ECS snapshot: entity index ${entityIndex} references archetype id ${archetype}, which has no entry in ${source} (length ${archetypeCount}).`,
    );

/**
 * Validate that every allocated occupied slot in a serialized location-table
 * snapshot references an archetype id within `0 .. archetypeCount - 1`. Throws
 * naming the entity index and archetype id when a slot is out of range.
 */
export const validateSerializedArchetypeIds = (
    data: unknown,
    archetypeCount: number,
    source: string = "archetypesData",
): void => {
    // Runtime invariant: `data` is a snapshot produced by this module's `toData`.
    const table = data as { entities: Int32Array; nextIndex: number };
    const src = table.entities;
    const count = Math.min(table.nextIndex, src.length >>> 1);
    for (let entityIndex = 0; entityIndex < count; entityIndex++) {
        const archetype = src[entityIndex << 1]!;
        if (archetype >= archetypeCount) {
            throw missingArchetypeError(entityIndex, archetype, archetypeCount, source);
        }
    }
};

/**
 * Return a copy of a serialized location-table snapshot (the shape `toData`
 * produces) with every allocated occupied entry's stored archetype id
 * translated through `archetypeIdMap`. Throws naming the entity index and
 * archetype id when an occupied slot references an id outside `archetypeIdMap`.
 *
 * A serialized archetype id is a dense array index captured at save time; the
 * archetype occupying that index can differ by the time of restore — a schema
 * change may have added, removed, or reordered an archetype — so the raw id is
 * not stable across a save/load boundary. Free-list markers (negative archetype
 * slots), `freeListHead`, `nextIndex`, and `capacity` are preserved exactly, so
 * the restored table allocates ids identically to the source. The remap is
 * applied to a fresh buffer (never in place): the input may reference the live
 * buffer of the store that produced it.
 */
export const remapSerializedArchetypeIds = (
    data: unknown,
    archetypeIdMap: readonly number[],
): unknown => {
    // Runtime invariant: `data` is a snapshot produced by this module's `toData`.
    const table = data as { entities: Int32Array; freeListHead: number; nextIndex: number; capacity: number };
    const src = table.entities;
    const entities = new Int32Array(src.length);
    const allocatedLength = Math.min(table.nextIndex * 2, src.length);
    for (let i = 0; i < allocatedLength; i += 2) {
        const archetype = src[i]!;
        if (archetype < 0) {
            entities[i] = archetype;
        } else {
            const mapped = archetypeIdMap[archetype];
            if (mapped === undefined) {
                throw missingArchetypeError(i >>> 1, archetype, archetypeIdMap.length);
            }
            entities[i] = mapped;
        }
        entities[i + 1] = src[i + 1]!;
    }
    return { ...table, entities };
};
