import type { Schema } from '../../interface/schema/schema.js';
import { schemaOf } from '../../interface/registry/index.js';
import { flushBetween } from './layout-directory.js';
import type { Pool } from './pool.js';
import type { State } from './state.js';

/**
 * Returns a function that brings workers up to date with the shared memory's layout: it flushes the layout directory,
 * where workers find archetypes and the entity table, and posts only new components' schemas. Called after every
 * sync point and wherever registration changes layouts, so workers see them before the next run's tasks; allocates
 * nothing when nothing is new.
 */
export const createPublisher = (state: State, pool: Pool): (() => void) => {
    let schemasSent = 0;
    return () => {
        flushBetween(state.directory, state.bumped, state.archetypes, state.entities, state.resourceEntity, state.counted);
        if (schemasSent === state.keys.length) return;
        // Workers never touch resources, so their schemas, defaults included, stay on the world's thread.
        // A value that isn't data has no schema; workers store it as an object they never touch.
        const schemas: (readonly [number, Schema | undefined])[] = [];
        for (let id = schemasSent; id < state.keys.length; id++) {
            if (!state.resources.has(id)) schemas.push([id, schemaOf(state.keys[id])]);
        }
        if (schemas.length > 0) pool.broadcast({ kind: "layout", schemas });
        // Only once sent, so a failed broadcast is retried after the next sync point.
        schemasSent = state.keys.length;
    };
};
