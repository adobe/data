import type { Component } from '../component/component.js';
import type { Entity } from '../entity/entity.js';

/** Structural changes and writes to other entities, applied in issue order at the next sync point. */
export type Commands = {
    /** Returns a real entity immediately; it becomes alive at the sync point. */
    spawn(values: Component.Values): Entity;
    despawn(entity: Entity): void;
    /** Adds or replaces values, marking them changed. */
    add(entity: Entity, values: Component.Values): void;
    remove(entity: Entity, ...components: readonly Component.Name[]): void;
};
