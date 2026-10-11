import type { Component } from '../component/component.js';
import type { Entity } from '../entity/entity.js';

/** Structural changes and writes to other entities, applied in issue order at the next sync point. */
export type Commands = {
    /** Returns a real entity immediately; it becomes alive at the sync point. */
    spawn(values: Component.Values): Entity;
    /**
     * `spawn` for entities of exactly `components`, resolved once rather than per spawn: faster for many entities of one
     * shape. Each spawn's values must name exactly these components.
     */
    spawner<const C extends readonly Component.Name[]>(components: C): (values: Component.ValuesOf<C>) => Entity;
    despawn(entity: Entity): void;
    /** Adds or replaces values, marking them changed. */
    add(entity: Entity, values: Component.Values): void;
    remove(entity: Entity, ...components: readonly Component.Name[]): void;
};
