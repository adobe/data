// © 2026 Adobe. MIT License. See /LICENSE for details.
import { resize } from "../../internal/array-buffer-like/resize.js";
import { EntityLocationTable } from "./entity-location-table.js";
import { EntityLocation } from "./entity-location.js";
import { Entity } from "../entity/entity.js";
import { GENERATION_COUNT, generationOf, localIndexLimit, toEntity, toLocalIndex } from "../entity/persistence-sharing.js";
import { createSharedArrayBuffer } from "../../internal/shared-array-buffer/create-shared-array-buffer.js";

/**
 * A location table for one entity quadrant (0..3). Slots are allocated per
 * quadrant and reused through a LIFO free list; each slot carries a generation
 * that advances when the slot is freed, so an id from before the free no longer
 * locates. The quadrant and generation are packed into each id (see
 * `persistence-sharing.ts`). `toData`/`fromData` serialize the raw slot arrays
 * (quadrant-agnostic); the quadrant is re-established by table position on load.
 * A snapshot without `generations` loads every slot at generation 0.
 */
export const createEntityLocationTable = (initialCapacity: number = 16, quadrant: number = 0): EntityLocationTable => {
    let freeListHead = -1;
    let nextIndex = 0;
    let capacity = initialCapacity;
    let entities = new Int32Array(createSharedArrayBuffer(capacity * 2 * 4));
    let generations = new Uint8Array(createSharedArrayBuffer(capacity));

    const ensureCapacity = (index: number) => {
        if (index < capacity) return;
        while (index >= capacity) capacity *= 2;
        entities = new Int32Array(resize(entities.buffer, capacity * 2 * 4));
        generations = new Uint8Array(resize(generations.buffer, capacity));
    };

    const isLive = (index: number) => index < nextIndex && entities[index << 1] >= 0;

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
            if (nextIndex >= localIndexLimit) {
                throw new Error("entity index space exhausted for quadrant " + quadrant);
            }
            index = nextIndex++;
            ensureCapacity(index);
        }
        entities[(index << 1) + 0] = archetype;
        entities[(index << 1) + 1] = row;
        return toEntity(index, quadrant, generations[index]);
    }

    const locateEntity = (entity: Entity): EntityLocation | null => {
        const index = toLocalIndex(entity);
        if (index >= nextIndex || entities[index << 1] < 0 || generations[index] !== generationOf(entity)) {
            return null;
        }
        return { archetype: entities[index << 1], row: entities[(index << 1) + 1] };
    }

    /**
     * Frees the entity's slot. The slot's generation advances unless `rewind` is
     * set, which hands the slot back as it was before it was created (rolling
     * back a speculative insert, so the next create reproduces the same id).
     */
    const deleteEntity = (entity: Entity, rewind: boolean = false) => {
        const index = toLocalIndex(entity);
        if (index >= nextIndex || entities[index << 1] < 0 || generations[index] !== generationOf(entity)) {
            return;
        }
        entities[(index << 1) + 0] = -1;
        entities[(index << 1) + 1] = freeListHead;
        freeListHead = index;
        if (!rewind) {
            generations[index] = (generations[index] + 1) % GENERATION_COUNT;
        }
    }

    const updateEntity = (entity: Entity, location: EntityLocation) => {
        if (location.row < 0) {
            throw new Error("update row must be >= 0");
        }
        const index = toLocalIndex(entity);
        entities[(index << 1) + 0] = location.archetype;
        entities[(index << 1) + 1] = location.row;
    }

    const unlinkFree = (index: number) => {
        if (freeListHead === index) {
            freeListHead = entities[(index << 1) + 1];
            return;
        }
        let cursor = freeListHead;
        while (cursor >= 0) {
            const next = entities[(cursor << 1) + 1];
            if (next === index) {
                entities[(cursor << 1) + 1] = entities[(index << 1) + 1];
                return;
            }
            cursor = next;
        }
    }

    const restoreEntity = (entity: Entity, location: EntityLocation): boolean => {
        if (location.row < 0) {
            throw new Error("restore row must be >= 0");
        }
        const index = toLocalIndex(entity);
        if (isLive(index)) {
            return false;
        }
        if (index >= nextIndex) {
            ensureCapacity(index);
            for (let slot = nextIndex; slot < index; slot++) {
                entities[(slot << 1) + 0] = -1;
                entities[(slot << 1) + 1] = freeListHead;
                freeListHead = slot;
            }
            nextIndex = index + 1;
        } else {
            unlinkFree(index);
        }
        generations[index] = generationOf(entity);
        entities[(index << 1) + 0] = location.archetype;
        entities[(index << 1) + 1] = location.row;
        return true;
    }

    return {
        create: createEntity,
        delete: deleteEntity,
        restore: restoreEntity,
        locate: locateEntity,
        update: updateEntity,
        reset: () => {
            freeListHead = -1;
            nextIndex = 0;
            generations.fill(0);
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
            freeListHead = data.freeListHead;
            nextIndex = data.nextIndex;
            capacity = data.capacity;
            generations = data.generations ?? new Uint8Array(createSharedArrayBuffer(capacity));
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
