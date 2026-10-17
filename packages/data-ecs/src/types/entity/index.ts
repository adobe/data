import type { Schema } from '../schema/schema.js';
import type { Entity } from './entity.js';

/** The schema of every entity-typed value. */
export const schema = { type: "integer", format: "entity" } as const satisfies Schema;

/** No entity: index 0 is never one, so zeroed memory and an entity-valued default mean none, and a lookup of it returns null. */
export const none = 0 as Entity;
