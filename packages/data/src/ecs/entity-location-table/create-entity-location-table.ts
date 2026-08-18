// © 2026 Adobe. MIT License. See /LICENSE for details.
import { resize } from "../../internal/array-buffer-like/resize.js";
import { EntityLocationTable } from "./entity-location-table.js";
import { EntityLocation } from "./entity-location.js";
import { Entity } from "../entity/entity.js";
import { toEntity, toLocalIndex } from "../entity/persistence-sharing.js";
import { createSharedArrayBuffer } from "../../internal/shared-array-buffer/create-shared-array-buffer.js";

/**
 * A location table for one entity quadrant (0..3). The backing store allocates
 * dense per-quadrant local indices; this wrapper packs the quadrant into each
 * id's low bits (and strips it on the way back in) so an entity id alone names
 * its quadrant. `toData`/`fromData` serialize the raw local-index array
 * (quadrant-agnostic); the quadrant is re-established by table position on load.
 */
export const createEntityLocationTable = (initialCapacity: number = 16, quadrant: number = 0): EntityLocationTable => {
    const table = createLocalIndexEntityLocationTable(initialCapacity);
    return {
        ...table,
        create: (location: EntityLocation): Entity => toEntity(table.create(location), quadrant),
        delete: (entity: Entity) => table.delete(toLocalIndex(entity)),
        locate: (entity: Entity) => table.locate(toLocalIndex(entity)),
        update: (entity: Entity, location: EntityLocation) => table.update(toLocalIndex(entity), location),
    };
}

const createLocalIndexEntityLocationTable = (initialCapacity: number = 16): EntityLocationTable => {
    let freeListHead = -1;
    let nextIndex = 0;
    let capacity = initialCapacity;
    let entities = new Int32Array(createSharedArrayBuffer(capacity * 2 * 4));

    const createEntity = ({ archetype, row }: EntityLocation): Entity => {
        if (row < 0) {
            throw new Error("create row must be >= 0");
        }
        let entity: number;
        if (freeListHead >= 0) {
            entity = freeListHead;
            const index = freeListHead << 1;
            freeListHead = entities[index + 1];
        }
        else {
            entity = nextIndex++;
            if (nextIndex >= capacity) {
                capacity *= 2;
                entities = new Int32Array(resize(entities.buffer, capacity * 2 * 4));
            }
        }

        const index = entity << 1;
        entities[index + 0] = archetype;
        entities[index + 1] = row;

        return entity;
    }

    const deleteEntity = (entity: Entity) => {
        if (entity < 0) {
            throw new Error("delete entity must be >= 0");
        }
        const index = entity << 1;
        entities[index + 0] = -1;
        entities[index + 1] = freeListHead;
        freeListHead = entity;
    }

    const locateEntity = (entity: Entity): EntityLocation | null => {
        if (entity < 0) {
            throw new Error("locate entity must be >= 0");
        }
        if (entity >= nextIndex) {
            return null;
        }
        const index = entity << 1;
        const archetype = entities[index + 0];
        if (archetype < 0) {
            return null;
        }
        const row = entities[index + 1];
        return { archetype, row };
    }

    const updateEntity = (entity: Entity, location: EntityLocation) => {
        if (entity < 0 || location.row < 0) {
            throw new Error("update entity and row must be >= 0");
        }
        const index = entity << 1;
        entities[index + 0] = location.archetype;
        entities[index + 1] = location.row;
    }

    return {
        create: createEntity,
        delete: deleteEntity,
        locate: locateEntity,
        update: updateEntity,
        reset: () => {
            freeListHead = -1;
            nextIndex = 0;
        },
        toData: (copy = false) => ({
            entities: copy ? entities.slice() : entities,
            freeListHead,
            nextIndex,
            capacity,
        }),
        fromData: (data: any) => {
            entities = data.entities;
            freeListHead = data.freeListHead;
            nextIndex = data.nextIndex;
            capacity = data.capacity;
        }
    };
}

/**
 * Return a copy of a serialized location-table snapshot (the shape `toData`
 * produces) with every entry's stored archetype id translated through
 * `archetypeIdMap` (`archetypeIdMap[oldId] ?? oldId`).
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
    for (let i = 0; i < src.length; i += 2) {
        const archetype = src[i]!;
        entities[i] = archetype < 0 ? archetype : (archetypeIdMap[archetype] ?? archetype);
        entities[i + 1] = src[i + 1]!;
    }
    return { ...table, entities };
};
