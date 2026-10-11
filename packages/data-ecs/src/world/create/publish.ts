import type { Schema } from '../../schema/schema.js';
import { schemaOf } from '../../registry/create-registry.js';
import type { Archetype } from './archetype.js';
import type { Pool } from './pool.js';
import type { ArchetypeLayout, EntitiesLayout } from './protocol.js';
import type { State } from './state.js';

const archetypeLayout = (archetype: Archetype): ArchetypeLayout => ({
    id: archetype.id,
    capacity: archetype.capacity,
    entities: archetype.entities.byteOffset,
    storages: archetype.storages.map(storage => ({
        id: storage.component,
        column: storage.layout.kind === "linear" ? storage.views.u8.byteOffset : -1,
        added: storage.added.byteOffset,
        changed: storage.changed.byteOffset,
        chunkAdded: storage.chunkAdded.byteOffset,
        chunkChanged: storage.chunkChanged.byteOffset,
        chunks: storage.chunkAdded.length,
    })),
});

const entitiesLayout = ({ entities }: State): EntitiesLayout => ({
    cursor: entities.cursor.byteOffset,
    free: entities.free.byteOffset,
    freeCapacity: entities.free.length,
    archetype: entities.archetype.byteOffset,
    row: entities.row.byteOffset,
    generation: entities.generation.byteOffset,
    capacity: entities.archetype.length,
    length: entities.length,
});

const sameEntities = (a: EntitiesLayout | null, b: EntitiesLayout): boolean =>
    a !== null && a.free === b.free && a.archetype === b.archetype && a.row === b.row && a.generation === b.generation && a.length === b.length;

/**
 * Returns a function that tells workers what changed in the shared memory's layout: new schemas, new or grown archetypes,
 * and the entity table. Called after every sync point, so workers see the layout before the next run's tasks.
 */
export const createPublisher = (state: State, pool: Pool): (() => void) => {
    let schemasSent = 0;
    const versions = new Map<Archetype, number>();
    let entitiesSent: EntitiesLayout | null = null;
    return () => {
        // Workers never touch resources, so their schemas, defaults included, stay on the main thread.
        const schemas: (readonly [number, Schema])[] = [];
        for (let id = schemasSent; id < state.keys.length; id++) {
            const schema = schemaOf(state.keys[id]);
            if (schema !== undefined && !state.resources.has(id)) schemas.push([id, schema]);
        }
        const changed = state.archetypes.filter(archetype => !archetype.resource && versions.get(archetype) !== archetype.version);
        const entities = entitiesLayout(state);
        if (schemas.length === 0 && changed.length === 0 && sameEntities(entitiesSent, entities)) return;
        pool.broadcast({ kind: "layout", schemas, entities, archetypes: changed.map(archetypeLayout) });
        // Only once sent, so a failed broadcast is retried after the next sync point.
        schemasSent = state.keys.length;
        for (const archetype of changed) versions.set(archetype, archetype.version);
        entitiesSent = entities;
    };
};
