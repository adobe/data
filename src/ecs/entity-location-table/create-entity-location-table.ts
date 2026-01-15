// © 2026 Adobe. MIT License. See /LICENSE for details.
import { resize } from "../../internal/array-buffer-like/resize.js";
import { EntityLocationTable } from "./entity-location-table.js";
import { EntityLocation } from "./entity-location.js";
import { Entity } from "../entity.js";
import { createSharedArrayBuffer } from "../../internal/shared-array-buffer/create-shared-array-buffer.js";

export const createEntityLocationTable = (initialCapacity: number = 16, transient: boolean = false): EntityLocationTable => {
    return transient ? createNegativeEntityLocationTable(initialCapacity) : createPositiveEntityLocationTable(initialCapacity);
}

const createNegativeEntityLocationTable = (initialCapacity: number = 16): EntityLocationTable => {
    const table = createEntityLocationTable(initialCapacity);
    return {
        ...table,
        create: (location: EntityLocation): Entity => -1 - table.create(location),
        delete: (entity: Entity) => table.delete(-1 - entity),
        locate: (entity: Entity) => table.locate(-1 - entity),
        update: (entity: Entity, location: EntityLocation) => table.update(-1 - entity, location)
    }
}

const createPositiveEntityLocationTable = (initialCapacity: number = 16): EntityLocationTable => {
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
        toData: () => ({
            entities,
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
